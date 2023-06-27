package saovivo

import (
	"fmt"
	"io"
	"net/http"
	"strconv"
	"sync"
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
	if rsp.StatusCode != http.StatusPartialContent {
		return fmt.Errorf("http getChunk response: %d", rsp.StatusCode)
	}
	c.Buf, err = io.ReadAll(rsp.Body)
	if err != nil {
		return err
	}
	return nil
}

func chunkDownloadThread(uri string, output chan chunk, err chan error, abort chan bool, chunks []chunk, wg *sync.WaitGroup) {
	go func() {
		defer wg.Done()
		for i := range chunks {
			select {
			case <-abort:
				return
			default:
			}
			if e := getChunk(uri, &chunks[i]); e != nil {
				err <- e
				return
			}
			select {
			case output <- chunks[i]:
				continue
			case <-abort:
				return
			}
		}
	}()
}

func multiThreadDownload(dst io.Writer, uri string, length int, threads int) error {
	order := make(map[int]*chunk)

	chunks, err := getChunksCount(length)
	if err != nil {
		return err
	}

	var wg sync.WaitGroup

	total := len(chunks)
	output := make(chan chunk, threads*5)
	cerr := make(chan error, threads)
	abort := make(chan bool, threads)

	c := shuffleChunks(chunks, threads)
	for i := 0; i < threads; i++ {
		wg.Add(1)
		chunkDownloadThread(uri, output, cerr, abort, c[i], &wg)
	}

	expected := 0
	retErr := error(nil)
	for {
		select {
		case d := <-output:
			if d.N != expected {
				order[d.N] = &d
			} else {
				_, e := dst.Write(d.Buf)
				if e != nil {
					retErr = e
					goto exit
				}
				expected = expected + 1
				for ; order[expected] != nil; expected = expected + 1 {
					_, e := dst.Write(order[expected].Buf)
					if e != nil {
						retErr = e
						goto exit
					}
				}
			}
			if expected == total {
				return nil
			}
		case e := <-cerr:
			retErr = e
			goto exit
		}
	}
exit:
	for i := 0; i < threads; i++ {
		abort <- true
	}
	fmt.Println("Esperando que terminen todos los hilos ", cap(output), len(output), cap(abort), len(abort), cap(cerr), len(cerr))
	wg.Wait()
	fmt.Println("Todos los hilos terminaron")
	return retErr
}

func Download(dst io.Writer, uri string) error {
	if b, s, e := supportRangeDownload(uri); b {
		fmt.Println(b, s, e)
		return multiThreadDownload(dst, uri, s, 3)
	} else {
		return e
	}
}
