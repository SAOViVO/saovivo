package saovivo

import (
	"container/list"
	"fmt"
	"strconv"

	"github.com/google/uuid"
)

type VideoFile struct {
	Remote string
	Local  string
}

type Asset struct {
	Id       string    `json:"id"`
	Name     string    `json:"name"`
	Duration string    `json:"duration"`
	Video    VideoFile `json:"-"`
}

type Playlist struct {
	videoQueue *list.List
	reproduced *list.List
	inPlay     *Asset
}

func (p *Playlist) Dump() {
	if p.inPlay != nil {
		fmt.Println("In Play: ", p.inPlay)
	}
	fmt.Println("Queue")
	for e := p.videoQueue.Front(); e != nil; e = e.Next() {
		fmt.Println(e.Value.(*Asset).Id, e.Value.(*Asset).Name)
	}
	fmt.Println("Rep")
	for e := p.reproduced.Front(); e != nil; e = e.Next() {
		fmt.Println(e.Value.(*Asset).Id)
	}
}

func NewPlaylist() *Playlist {
	var playlist Playlist
	playlist.videoQueue = list.New()
	playlist.reproduced = list.New()
	playlist.inPlay = nil
	return &playlist
}

func NewAsset(name string, assetpath string, duration string) *Asset {
	var a Asset
	a.Id = uuid.New().String()
	a.Name = name
	a.Duration = duration
	a.Video = VideoFile{Remote: assetpath, Local: a.Id + ".ts"}
	return &a
}

func (p *Playlist) Append(asset *Asset) string {
	p.videoQueue.PushBack(asset)
	return asset.Id
}

func (p *Playlist) GetAssetNameById(id string) string {
	e, _ := p.getListElementByAssetId(id)
	if e != nil {
		return e.Value.(*Asset).Name
	}
	e, _ = p.getListElementByAssetIdInReproduced(id)
	if e != nil {
		return e.Value.(*Asset).Name
	}
	return ""
}

func (p *Playlist) getListElementByAssetIdInReproduced(id string) (*list.Element, int) {
	i := 0
	for e := p.videoQueue.Front(); e != nil; e = e.Next() {
		if e.Value.(*Asset).Id == id {
			return e, i
		}
		i++
	}
	return nil, -1
}

func (p *Playlist) getListElementByAssetId(id string) (*list.Element, int) {
	i := 0
	for e := p.videoQueue.Front(); e != nil; e = e.Next() {
		if e.Value.(*Asset).Id == id {
			return e, i
		}
		i++
	}
	return nil, -1
}

func (p *Playlist) getListElementInReproducedByAssetId(id string) any {
	for e := p.reproduced.Front(); e != nil; e = e.Next() {
		if e.Value.(*Asset).Id == id {
			return p.reproduced.Remove(e)
		}
	}
	return nil
}

func (p *Playlist) getListElementByPosition(position int) *list.Element {
	var (
		e *list.Element
		i int
	)
	for i, e = 0, p.videoQueue.Front(); e != nil && i < position; i, e = i+1, e.Next() {
	}
	if e != nil && i == position {
		return e
	}
	return nil
}

func (p *Playlist) RemoveAll() {
	p.videoQueue = p.videoQueue.Init()
	p.reproduced = p.reproduced.Init()
	p.inPlay = nil
}

func (p *Playlist) Remove(id string) bool {
	e, _ := p.getListElementByAssetId(id)
	if e != nil {
		p.videoQueue.Remove(e)
		return true
	}
	return false
}

func (p *Playlist) MoveByAssetIdToPosition(id string, position int) bool {
	if position > p.videoQueue.Len()-1 {
		return false
	}
	s := p.getListElementByPosition(position)
	if s == nil {
		return false
	}
	e, ep := p.getListElementByAssetId(id)
	if e == nil {
		v := p.getListElementInReproducedByAssetId(id)
		if v == nil {
			return false
		}
		p.videoQueue.InsertBefore(v, s)
		return true
	}

	if ep < position {
		p.videoQueue.MoveAfter(e, s)
	} else {
		p.videoQueue.MoveBefore(e, s)
	}
	return true
}

func (p *Playlist) MoveByAssetIdToPositionGPT(id string, position int) bool {
	videoQueueLen := p.videoQueue.Len()
	if position < 0 || position >= videoQueueLen {
		return false
	}

	targetElement := p.getListElementByPosition(position)
	if targetElement == nil {
		return false
	}

	sourceElement, sourcePosition := p.getListElementByAssetId(id)
	if sourceElement == nil {
		assetInReproduced := p.getListElementInReproducedByAssetId(id)
		if assetInReproduced == nil {
			return false
		}
		newElement := p.videoQueue.InsertBefore(assetInReproduced, targetElement)
		return newElement != nil
	}

	if sourcePosition == position {
		return true // Already in the desired position
	}

	if sourcePosition < position {
		p.videoQueue.MoveAfter(sourceElement, targetElement)
	} else {
		p.videoQueue.MoveBefore(sourceElement, targetElement)
	}
	return true
}

func (p *Playlist) Shift(end bool) *Asset {
	if p.inPlay != nil {
		p.reproduced.PushBack(p.inPlay)
		p.inPlay = nil
	}
	if p.videoQueue.Len() == 0 {
		if p.reproduced.Len() > 0 {
			p.videoQueue.PushBackList(p.reproduced)
			p.reproduced.Init()
		}
	}
	if p.videoQueue.Len() > 0 && !end {
		asset := p.videoQueue.Remove(p.videoQueue.Front())
		p.inPlay = asset.(*Asset)
	}
	if end {
		p.videoQueue.PushBackList(p.reproduced)
		p.reproduced.Init()
	}
	return p.inPlay
}

func (p *Playlist) Len() int {
	i := 0
	if p.inPlay != nil {
		i = 1
	}
	return p.videoQueue.Len() + p.reproduced.Len() + i
}

func (p *Playlist) InQueue() int {
	return p.videoQueue.Len()
}

func (p *Playlist) Map() map[string]interface{} {
	var duration float64
	m := make(map[string]interface{})
	m["inPlay"] = p.inPlay
	v := []*Asset{}
	r := []*Asset{}
	m["reproduced"] = []*Asset{}
	for e := p.videoQueue.Front(); e != nil; e = e.Next() {
		v = append(v, e.Value.(*Asset))
		if s, err := strconv.ParseFloat(e.Value.(*Asset).Duration, 64); err == nil {
			duration += s
		}
	}
	for e := p.reproduced.Front(); e != nil; e = e.Next() {
		r = append(r, e.Value.(*Asset))
		if s, err := strconv.ParseFloat(e.Value.(*Asset).Duration, 64); err == nil {
			duration += s
		}
	}
	m["videoQueue"] = v
	m["reproduced"] = r
	m["duration"] = fmt.Sprintf("%.2f", duration)
	if p.inPlay != nil {
		m["total"] = len(v) + len(r) + 1
	} else {
		m["total"] = len(v) + len(r)
	}
	return m
}
