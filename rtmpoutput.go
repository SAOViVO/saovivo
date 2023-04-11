package saovivo

import (
	"io"
	"net"
	"time"
)

type RtmpOutput struct {
	Input  chan io.ReadCloser
	Output chan error
	ffmpeg *FFMPEG
}

func NewRtmpOutput(rtmp string) (*RtmpOutput, error) {
	var (
		src RtmpOutput
		srv *net.TCPListener
		dst io.WriteCloser
		err error
	)
	addr, _ := net.ResolveTCPAddr("tcp", "127.0.0.1:0")
	srv, err = net.ListenTCP("tcp4", addr)
	if err != nil {
		return nil, err
	}

	srv.SetDeadline(time.Now().Add(10 * time.Second))
	tcp := "tcp://" + srv.Addr().String()

	ffmpeg := FFMPEGStream(tcp, rtmp, CopyPreset)
	src.ffmpeg = ffmpeg
	ffmpeg.Run()

	dst, err = srv.Accept()
	if err != nil {
		return nil, err
	}

	src.Input = make(chan io.ReadCloser)
	src.Output = make(chan error)

	go func() {
		lout.Printf("RtmpOutput: Start, listen on: %s, sending to: %s", tcp, rtmp)
		for {
			in := <-src.Input
			if in == nil {
				lout.Println("RtmpOutput: nothing to do, stoping")
				ffmpeg.Stop()
				e := <-ffmpeg.err
				src.Output <- e
				goto end_loop
			}
			for {
				n, err := io.Copy(dst, in)
				in.Close()
				if err != nil && n != 0 {
					//	select {
					//	case e := <-ffmpeg.err:
					//		src.Output <- e
					//		goto end_loop
					//	default:
					//		src.Output <- nil
					//		break
					lerr.Printf("RtmpOutput: send with error: %v", err)
					e := <-ffmpeg.err
					src.Output <- e
					goto end_loop
					//}
				} else {
					src.Output <- nil
					break
				}
			}
		}
	end_loop:
		lout.Println("RtmpOutput: End")
	}()
	return &src, nil
}

func (r *RtmpOutput) Stop() {
	r.ffmpeg.Stop()
}
