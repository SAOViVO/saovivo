package saovivo

import (
	"fmt"
	"os"
	"path/filepath"
)

type VideoChannel struct {
	Input  chan<- *VideoFile
	Output <-chan error
	Abort  chan<- bool
}

func (v *VideoChannel) Stop() {
	v.Abort <- true
}

func NewVideoChannel(rtmpOutput string, storage string) (*VideoChannel, error) {
	channel := make(chan *VideoFile)
	abort := make(chan bool)
	output := make(chan error)

	rtmp, err := NewRtmpOutput(rtmpOutput)
	if err != nil {
		return nil, err
	}

	go func() {
		lout.Println("VideoChannel: Start")
		for {
			var (
				video     *VideoFile
				ingest    *VideoIngest
				end       bool
				ingestRun bool
			)
			ingestRun = false
			select {
			case video = <-channel:
			case end = <-abort:
			}
			if video == nil || end {
				rtmp.Input <- nil // Signal to end
				<-rtmp.Output     // Wait end
				output <- nil     // Own signal to say goodbye
				goto end_loop
			}
			videoLocal := filepath.Join(storage, video.Local)
			if _, err := os.Stat(videoLocal); err != nil {
				lout.Println("VideoChannel: local files does not exist, creating new ingest job")
				ingest, err = NewVideoIngest(video.Remote, videoLocal)
				if err != nil {
					lerr.Printf("VideoChannel: impossible to create a new ingest job: %v", err)
					output <- err
					continue
				}
				ingestRun = true
				rtmp.Input <- ingest.File
			} else {
				lout.Printf("VideoChannel: processing local file: %s", videoLocal)
				rc, err := os.Open(videoLocal)
				if err != nil {
					lerr.Printf("VideoChannel: processing local file with errors: %v", err)
					continue
				}
				rtmp.Input <- rc
			}

			select {
			case <-abort:
				lout.Printf("VideoChannel: abort operation.")
				rtmp.Stop()
				<-rtmp.Output
				if ingestRun {
					lout.Printf("VideoChannel: waiting ingest Job.")
					<-ingest.Output
					lout.Printf("VideoChannel: end ingest Job.")
				}
				output <- fmt.Errorf("Abort")
				goto end_loop
			case re := <-rtmp.Output:
				lout.Printf("VideoChannel: rtmp return")
				if ingestRun {
					<-ingest.Output
				}
				output <- re
				if re != nil {
					lerr.Printf("VideoChannel: rtmp output with errors: %v", re)
					goto end_loop
				}
			}
		}
	end_loop:
		lout.Println("VideoChannel: End")
	}()
	return &VideoChannel{channel, output, abort}, nil
}
