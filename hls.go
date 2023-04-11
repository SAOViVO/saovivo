package saovivo

import (
	"bufio"
	"fmt"
	"net/http"
	"net/url"
	"path/filepath"
	"sort"
	"strings"

	"github.com/grafov/m3u8"
)

func addHlsBaseURI(originalUri string, uri string) string {
	if !strings.HasPrefix(uri, "http") {
		u, _ := url.Parse(originalUri)
		u.RawQuery = ""
		u.Path = filepath.Dir(u.Path)
		uri = u.String() + "/" + uri
	}
	return uri
}

func getHlsStreamURI(uri string) (string, error) {
	originalUri := uri
	file, err := http.Get(uri)
	if err != nil {
		return "", err
	}
	defer file.Body.Close()
	p, t, e := m3u8.DecodeFrom(bufio.NewReader(file.Body), false)
	if e != nil {
		return "", err
	}

	switch t {
	case m3u8.MASTER:
		master := p.(*m3u8.MasterPlaylist)

		sort.Slice(master.Variants, func(i, j int) bool {
			return master.Variants[i].Bandwidth > master.Variants[j].Bandwidth
		})

		uri = master.Variants[0].URI

	case m3u8.MEDIA:
		uri = uri
	}

	return addHlsBaseURI(originalUri, uri), nil
}

func getHlsSegmentsFromURI(uri string) ([]string, error) {
	var segments []string

	file, err := http.Get(uri)
	if err != nil {
		return nil, err
	}
	defer file.Body.Close()
	p, t, e := m3u8.DecodeFrom(bufio.NewReader(file.Body), false)
	if e != nil {
		return nil, err
	}

	switch t {
	case m3u8.MASTER:
		return nil, fmt.Errorf("Expected media file, master found")
	case m3u8.MEDIA:
		for _, s := range p.(*m3u8.MediaPlaylist).Segments {
			if s != nil {
				segments = append(segments, addHlsBaseURI(uri, s.URI))
			}
		}
	}
	return segments, nil
}
