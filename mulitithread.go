package saovivo

import (
	"io"
	"net/http"
	"strconv"
)

type chunk struct {
	N     int
	Start int
	End   int
	Buf   []byte
}

var (
	chunkLength = 10 * 1024
)

func (c *chunk) String() string {
	return strconv.Itoa(c.Start) + "-" + strconv.Itoa(c.End)
}

func supportRangeDownload(uri string) (bool, int, error) {
	client := &http.Client{}

	req, err := http.NewRequest("HEAD", uri, nil)
	if err != nil {
		return false, 0, err
	}
	req.Header.Set("Accept", "*/*")

	rsp, err := client.Do(req)
	if err != nil {
		return false, 0, err
	}
	if rsp.Header.Get("Accept-Ranges") == "bytes" {
		l, _ := strconv.ParseUint(rsp.Header.Get("Content-Length"), 10, 64)
		return true, int(l), nil
	}
	return false, 0, nil
}

func getChunksCount(contentLength int) ([]chunk, error) {
	var chunks []chunk
	var i int

	c := contentLength / chunkLength
	l := contentLength % chunkLength

	if l != 0 {
		chunks = make([]chunk, c+1)
	} else {
		chunks = make([]chunk, c)
	}

	for i = 0; i < c; i++ {
		chunks[i].Start = i * chunkLength
		chunks[i].End = ((i + 1) * chunkLength) - 1
		chunks[i].N = i
	}
	if l != 0 {
		chunks[i].Start = i * chunkLength
		chunks[i].End = int(contentLength)
		chunks[i].N = i
	}
	return chunks, nil
}

func shuffleChunks(chunks []chunk, threads int) [][]chunk {
	var ret [][]chunk
	ret = make([][]chunk, threads)

	for i, c := range chunks {
		ret[i%threads] = append(ret[i%threads], c)
	}
	return ret
}

func getChunk(uri string, c *chunk) error {
	client := &http.Client{}

	req, err := http.NewRequest("GET", uri, nil)
	if err != nil {
		return err
	}
	req.Header.Add("Range", "bytes="+c.String())

	rsp, err := client.Do(req)
	if err != nil {
		return err
	}

	c.Buf, err = io.ReadAll(rsp.Body)
	if err != nil {
		return err
	}
	return nil
}

func chunkDownloadThread(uri string, output chan chunk, err chan error, chunks []chunk) {
	go func() {
		defer func() { recover() }()
		for i, _ := range chunks {
			if e := getChunk(uri, &chunks[i]); e != nil {
				err <- e
				return
			}
			output <- chunks[i]
		}
	}()
}

func multiThreadDownload(dst io.Writer, uri string, length int, threads int) error {
	order := make(map[int]*chunk)

	chunks, err := getChunksCount(length)
	if err != nil {
		return err
	}

	total := len(chunks)
	output := make(chan chunk, threads*5)
	cerr := make(chan error)

	c := shuffleChunks(chunks, threads)
	for i := 0; i < threads; i++ {
		chunkDownloadThread(uri, output, cerr, c[i])
	}

	expected := 0

	for {
		select {
		case d := <-output:
			if d.N != expected {
				order[d.N] = &d
			} else {
				dst.Write(d.Buf)
				expected = expected + 1
				for ; order[expected] != nil; expected = expected + 1 {
					dst.Write(order[expected].Buf)
				}
			}
			if expected == total {
				return nil
			}
		case e := <-cerr:
			close(output)
			close(cerr)
			return e
		}
	}
	return nil
}
