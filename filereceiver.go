package saovivo

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"streaminfo"
	"strings"

	"github.com/kkdai/youtube"
)

type FileReceiver struct {
	localpath string
}

func validExtension(filename string) bool {
	return strings.HasSuffix(filename, ".mp4")
}

func (f *FileReceiver) GetRemote(url string) ([]*Asset, error) {
	var urls []string
	if !isYoutubeDomain(url) {
		return nil, fmt.Errorf("the video is not a youtube content")
	}
	if playlist := isYoutubePlaylist(url); playlist != nil {
		urls = getYoutubeUrlsFromPlaylist(playlist)
	} else {
		urls = []string{url}
	}

	assets := []*Asset{}

	client := youtube.Client{}
	for _, u := range urls {
		video, err := client.GetVideo(u)
		if err != nil {
			return nil, err
		}
		duration := fmt.Sprintf("%2.f", video.Duration.Seconds())
		assets = append(assets, NewAsset(video.Title, u, duration))
	}
	return assets, nil
}

func (f *FileReceiver) Recv(r *http.Request) ([]*Asset, error) {

	assets := []*Asset{}

	err := r.ParseMultipartForm((32 << 20))
	if err != nil {
		return nil, err
	}

	files := r.MultipartForm.File["files"]
	for _, fileHeader := range files {

		rFile, err := fileHeader.Open()
		if err != nil {
			fmt.Println("Error: ", err)
			continue
		}

		if !validExtension(fileHeader.Filename) {
			fmt.Println("Error: invalid extension")
			continue
		}

		lFile, err := os.CreateTemp("", "*.mp4")
		if err != nil {
			fmt.Println("Create Error: ", err)
			continue
		}
		_, err = io.Copy(lFile, rFile)
		if err != nil {
			fmt.Println("Copy Error: ", err)
			continue
		}

		lFile.Close()
		rFile.Close()

		info, err := streaminfo.ExtractStreamInfo(lFile.Name())
		if err != nil {
			fmt.Println("Error: Stream Info", err)
			os.Remove(lFile.Name())
			continue
		}
		if duration, ok := info.Video.Get("duration"); ok {
			localFilename := filepath.Join(f.localpath, fileHeader.Filename)
			ffmpeg := FFMPEGStream(lFile.Name(), localFilename, FastStart)
			if err := ffmpeg.RunAndWait(); err == nil {
				assets = append(assets, NewAsset(fileHeader.Filename, localFilename, duration.(string)))
			} else {
				fmt.Println("Error ffmpeg: ", err)
			}
		}
		os.Remove(lFile.Name())
	}
	return assets, nil
}

func NewFileReceiver(path string) *FileReceiver {
	return &FileReceiver{localpath: path}
}
