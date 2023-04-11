package saovivo

import (
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/kkdai/youtube"
)

type VideoIngest struct {
	dst string
	uri []string

	preset      Preset
	localfile   bool
	contentType string // http content type
	multipart   bool   // Is an m3u8 file
	ffmpeg      *FFMPEG

	Output chan error

	File io.ReadCloser
}

func (v *VideoIngest) Abort() {
	v.ffmpeg.Stop()
}

func (v *VideoIngest) Dst() string {
	return v.dst
}

func isYoutubeVideo(uri string) bool {
	url, err := url.Parse(uri)
	if err != nil {
		return false
	}
	hparts := strings.Split(url.Hostname(), ".")
	domain := hparts[len(hparts)-2] + "." + hparts[len(hparts)-1]
	return domain == "youtube.com" || domain == "youtu.be"
}

func getContentType(uri string) (string, error) {
	client := &http.Client{}

	req, err := http.NewRequest("HEAD", uri, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Accept", "*/*")

	rsp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	return rsp.Header.Get("Content-Type"), nil
}

func sendToWriter(dst io.Writer, uri string, localfile bool) error {
	if !localfile {
		accept, length, err := supportRangeDownload(uri)
		if err != nil {
			return err
		}
		if accept {
			if e := multiThreadDownload(dst, uri, length, 10); e != nil {
				return nil
			}
		} else {
			client := &http.Client{}
			if _, e := url.ParseRequestURI(uri); e != nil {
				return e
			}

			request, e := http.NewRequest("GET", uri, nil)
			if e != nil {
				return e
			}

			ingest, e := client.Do(request)
			if e != nil {
				return e
			}
			defer ingest.Body.Close()
			if _, e := io.Copy(dst, ingest.Body); e != nil {
				return e
			}
		}
	} else {
		if file, e := os.Open(uri); e == nil {
			defer file.Close()
			if _, e := io.Copy(dst, file); e != nil {
				return e
			}
		} else {
			return e
		}
	}
	return nil
}

func (v *VideoIngest) verifySource(uri string) error {

	if strings.HasPrefix(uri, "http") {
		v.localfile = false
		if isYoutubeVideo(uri) {
			client := youtube.Client{}
			video, err := client.GetVideo(uri)
			if err != nil {
				return err
			}

			formats := video.Formats.WithAudioChannels()
			stream, err := client.GetStreamURL(video, &formats[1])
			if err != nil {
				return err
			}
			uri = stream
		}

		if contentType, err := getContentType(uri); err != nil {
			return err
		} else {
			v.contentType = contentType
		}

		switch v.contentType {
		case "application/x-mpegURL":
		case "application/vnd.apple.mpegurl":
			v.multipart = true
			uri, err := getHlsStreamURI(uri)
			if err != nil {
				return err
			}

			v.uri, err = getHlsSegmentsFromURI(uri)
			if err != nil {
				return err
			}
		default:
			v.multipart = false
			v.uri = []string{uri}
		}
	} else {
		v.localfile = true
		v.uri = []string{uri}
	}
	return nil
}

func NewVideoIngest(uri string, dst string) (*VideoIngest, error) {
	var ingest VideoIngest

	if err := ingest.verifySource(uri); err != nil {
		return nil, err
	}

	ingest.dst = dst
	ingest.Output = make(chan error)
	ingest.preset = SavePreset

	addr, _ := net.ResolveTCPAddr("tcp", "127.0.0.1:0")
	out, err := net.ListenTCP("tcp4", addr)
	if err != nil {
		return nil, err
	}

	go func() {

		var (
			srv *net.TCPListener
			dst io.WriteCloser
			err error
			tcp string
		)

		// Crear encoder
		addr, _ := net.ResolveTCPAddr("tcp", "127.0.0.1:0")
		srv, err = net.ListenTCP("tcp4", addr)
		if err != nil {
			ingest.Output <- err
			goto end_loop
		}

		srv.SetDeadline(time.Now().Add(10 * time.Second))
		tcp = "tcp://" + srv.Addr().String()
		lout.Printf("VideoIngest: Start, listen on: %s, sending to: %s and %s", tcp, "tcp://"+out.Addr().String(), ingest.dst)
		ingest.ffmpeg = FFMPEGStream(tcp, "'[f=mpegts]"+ingest.dst+"'|[f=mpegts]"+"tcp://"+out.Addr().String(), ingest.preset)
		ingest.ffmpeg.Run()

		dst, err = srv.Accept()
		if err != nil {
			if ingest.ffmpeg.IsRunning() {
				ingest.ffmpeg.StopAndWait()
			} else {
				ingest.ffmpeg.Wait()
			}
			goto end_loop
		}

		for _, uri := range ingest.uri {
			lout.Printf("VideoIngest: process uri: %s", uri)
			err = sendToWriter(dst, uri, ingest.localfile)
			if err != nil {
				lerr.Printf("VideoIngest: process with error: %v", err)
				if ingest.ffmpeg.IsRunning() {
					ingest.ffmpeg.StopAndWait()
				} else {
					ingest.ffmpeg.Wait()
				}
				ingest.Output <- err
				goto end_loop
			}
		}
		dst.Close()
		srv.Close()

		err = <-ingest.ffmpeg.err
		if err != nil {
			out.Close()
		}
		ingest.Output <- err
	end_loop:
		lout.Printf("VideoIngest: End")
	}()

	ingest.File, err = out.Accept()
	if err != nil {
		return nil, <-ingest.Output
	}
	return &ingest, nil
}

func (v *VideoIngest) Stop() {
	v.ffmpeg.Stop()
}

func (v *VideoIngest) Wait() error {
	return <-v.Output
}
