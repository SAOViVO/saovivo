package saovivo

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sync"
)

type Preset struct {
	flags  []string
	config []string
}

func (p *Preset) Command(input string, output string) []string {
	preset := append(p.flags, "-i", input)
	preset = append(preset, p.config...)
	return append(preset, output)
}

var (
	SavePreset = Preset{flags: []string{ /*"-v", "quiet", "-stats"*/ }, config: []string{
		"-err_detect", "ignore_err",
		"-vcodec",
		"libx264",
		"-preset",
		"fast",
		"-r",
		"30",
		"-bf",
		"0",
		"-g",
		"60",
		"-vb",
		"1500k",
		"-vprofile",
		"baseline",
		"-level",
		"3.0",
		"-pix_fmt", "yuv420p",
		"-acodec",
		"aac",
		"-ab",
		"128k",
		"-ar",
		"44100",
		"-ac",
		"2",
		"-strict",
		"experimental",
		"-f", "tee", "-map", "0:v", "-map", "0:a?",
	}}

	CopyPreset = Preset{flags: []string{ /*"-v", "quiet", "-stats",*/ "-re"}, config: []string{
		"-vcodec",
		"copy",
		"-acodec",
		"copy",
		"-f",
		"flv",
		"-flvflags",
		"no_duration_filesize",
	}}

	FastStart = Preset{flags: []string{"-y", "-v", "quiet"}, config: []string{
		"-codec",
		"copy",
		"-movflags",
		"faststart",
	}}
)

/*
	rtmp []string = []string{
		"-re",
		"-i",
		"",

		"-i",
		"logo.png",
		"-vcodec",
		"libx264",
		"-preset",
		"ultrafast",
		"-bf",
		"0",
		"-g",
		"60",
		"-vb",
		"1500k",
		"-vprofile",
		"baseline",
		"-level",
		"3.0",
		"-acodec",
		"aac",
		"-ab",
		"96000",
		"-ar",
		"48000",
		"-ac",
		"2",
		"-strict",
		"experimental",
		"-filter_complex",
		"overlay='x=main_w-overlay_w-(main_w*0.01):y=main_h*0.01'",
		"-f",
		"flv",
		"-flvflags",
		"no_duration_filesize",
	}
*/

type FFMPEG struct {
	cmd     *exec.Cmd
	err     chan error
	running bool
	lock    *sync.Mutex
}

var ffmpeg_exec string

func init() {
	path, _ := os.Getwd()
	if runtime.GOOS == "windows" {
		ffmpeg_exec = filepath.Join(path, "ffmpeg.exe")
	} else {
		ffmpeg_exec = filepath.Join(path, "ffmpeg")
	}
}

func ExistBinaryFile() bool {
	info, err := os.Stat(ffmpeg_exec)
	if os.IsNotExist(err) {
		return false
	}
	return !info.IsDir()
}

func FFMPEGStream(input string, output string, preset Preset) *FFMPEG {
	var ffmpeg FFMPEG

	ffmpeg.cmd = exec.Command(ffmpeg_exec, preset.Command(input, output)...)
	ffmpeg.err = make(chan error)
	ffmpeg.cmd.Stdout = os.Stdout
	ffmpeg.cmd.Stderr = os.Stderr
	ffmpeg.running = false
	ffmpeg.lock = &sync.Mutex{}
	return &ffmpeg
}

func (f *FFMPEG) IsRunning() bool {
	f.lock.Lock()
	defer f.lock.Unlock()
	return f.running
}

func (f *FFMPEG) RunAndWait() error {
	f.lock.Lock()
	f.running = true
	f.lock.Unlock()
	err := f.cmd.Run()
	f.lock.Lock()
	f.running = false
	f.lock.Unlock()
	return err
}

func (f *FFMPEG) Run() {
	f.lock.Lock()
	f.running = true
	f.lock.Unlock()
	go func() {
		err := f.cmd.Run()
		f.lock.Lock()
		f.running = false
		f.lock.Unlock()
		f.err <- err
	}()
}

func (f *FFMPEG) StopAndWait() error {
	f.cmd.Process.Kill()
	return <-f.err
}

func (f *FFMPEG) Wait() error {
	return <-f.err
}

func (f *FFMPEG) Stop() {
	f.cmd.Process.Kill()
}
