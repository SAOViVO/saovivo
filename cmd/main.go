package main

import (
	"bytes"
	"embed"
	"encoding/json"
	"ffbinaries"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"saovivo"
	"streaminfo"
	"strings"
	"sync"
	"time"
)

//go:embed build
var build embed.FS

var version = "1.0.0"

type VideoServer struct {
	playlist      *saovivo.Playlist
	vc            *saovivo.VideoChannel
	receiver      *saovivo.FileReceiver
	output        string
	status        string
	loop          bool
	lock          *sync.Mutex
	storage       string
	notifications []string
}

func NewVideoServer(storage string, download string) *VideoServer {
	var vs VideoServer
	vs.lock = &sync.Mutex{}
	vs.status = "stop"
	vs.playlist = saovivo.NewPlaylist()
	vs.storage = storage
	vs.loop = true
	vs.receiver = saovivo.NewFileReceiver(download)
	return &vs
}

func (vs *VideoServer) start() error {
	vs.lock.Lock()
	defer vs.lock.Unlock()
	if vs.output != "" && vs.status == "stop" && vs.vc == nil && vs.playlist.Len() > 0 {
		if vc, e := saovivo.NewVideoChannel(vs.output, vs.storage); e != nil {
			return e
		} else {
			vs.vc = vc
		}
		vs.status = "start"
		go func() {
			var asset *saovivo.Asset
			for {
				vs.lock.Lock()
				if vs.playlist.InQueue() == 0 && !vs.loop {
					vs.status = "stop"
				}
				if vs.status != "stop" {
					asset = vs.playlist.Shift(false)
				} else {
					asset = vs.playlist.Shift(true)
				}
				fmt.Println("Empieza la reproduccion de: ", asset)
				vs.lock.Unlock()
				if asset != nil {
					vs.vc.Input <- &(asset.Video)
					err := <-vs.vc.Output
					fmt.Printf("Output from Video Channel: %v\n", err)
					if err != nil {
						if fmt.Sprint(err) == "Abort" {
							vs.lock.Lock()
							vs.status = "stop"
							vs.playlist.Shift(true)
							vs.vc = nil
							vs.lock.Unlock()
							return
						} else if fmt.Sprint(err) == "Ingest" {
							fmt.Println("Fallo la ingesta")
							vs.lock.Lock()
							vs.notifications = append(vs.notifications, fmt.Sprintf("El video <b>%s</b> no se pudo reproducir por un error en la API de Youtube", asset.Name))
							fmt.Println(vs.notifications)
							vs.lock.Unlock()
						} else {
							fmt.Println("Estoy aca, esperando no se que")
							vs.vc, _ = saovivo.NewVideoChannel(vs.output, vs.storage)
						}
					}
				} else {
					select {
					case vs.vc.Input <- nil:
						<-vs.vc.Output
					default:
					}
					vs.vc = nil
					return
				}
			}

		}()
		return nil
	}
	return fmt.Errorf("wrong status")
}

func setResponse(w http.ResponseWriter, key string, message string) error {
	r := make(map[string]string)
	r[key] = message
	data, e := json.Marshal(r)
	if e != nil {
		return e
	}
	_, e = io.Copy(w, bytes.NewBuffer(data))
	return e
}

func (vs *VideoServer) stop() error {
	vs.lock.Lock()
	defer vs.lock.Unlock()
	if vs.status == "start" {
		vs.vc.Stop()
		vs.status = "stop"
		return nil
	}
	return fmt.Errorf("impossible to stop, not started")
}

func (vs *VideoServer) setOutput(rtmp string) {
	vs.lock.Lock()
	defer vs.lock.Unlock()
	vs.output = rtmp
}

func (vs *VideoServer) Json() (*bytes.Buffer, error) {
	vs.lock.Lock()
	defer vs.lock.Unlock()
	m := vs.playlist.Map()
	m["output"] = vs.output
	m["status"] = vs.status
	m["loop"] = vs.loop
	m["notifications"] = vs.notifications
	vs.notifications = []string{}
	data, e := json.Marshal(m)
	if e != nil {
		return nil, e
	}
	return bytes.NewBuffer(data), nil
}

func (vs *VideoServer) appendToPlaylist(asset *saovivo.Asset) string {
	vs.lock.Lock()
	defer vs.lock.Unlock()
	return vs.playlist.Append(asset)
}

func (vs *VideoServer) HttpMethodPatch(w http.ResponseWriter, r *http.Request) {
	body := make(map[string]interface{})
	if e := json.NewDecoder(r.Body).Decode(&body); e != nil {
		setResponse(w, "error", fmt.Sprintf("%v", e))
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	for key, value := range body {
		switch key {
		case "loop":
			vs.lock.Lock()
			vs.loop = value.(bool)
			text := ""
			if !vs.loop {
				text = "La repetición de la lista está <b>DESACTIVADA</b>, el stream terminará al finalizar el ultimo video de la lista"
			} else {
				text = "La repetición de la lista está <b>ACTIVADA</b>, el stream volverá a reproducir el primer video de la lista, cuando finalice el último"
			}
			vs.lock.Unlock()
			setResponse(w, "message", text)
		case "output":
			vs.setOutput("rtmp://a.rtmp.youtube.com/live2/" + value.(string))
			setResponse(w, "message", fmt.Sprintf("Destino de transmision: %s", value.(string)))
		case "id":
			id := value.(string)
			position, ok := body["position"]
			if !ok {
				setResponse(w, "error", "unable to find position key")
				w.WriteHeader(http.StatusBadRequest)
				return
			}
			vs.lock.Lock()
			vs.playlist.MoveByAssetIdToPosition(id, int(position.(float64)))

			name := vs.playlist.GetAssetNameById(id)
			vs.lock.Unlock()
			setResponse(w, "message", fmt.Sprintf("Nueva posición %d para el video <b>%s</b>", int(position.(float64)), name))
		}
	}
}

func (vs *VideoServer) HttpMethodPost(w http.ResponseWriter, r *http.Request) {
	body := make(map[string]string)
	if e := json.NewDecoder(r.Body).Decode(&body); e != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	url, ok := body["url"]
	if !ok {
		w.WriteHeader(http.StatusBadRequest)
		setResponse(w, "error", "unable to find url key")

		return
	}
	if !strings.HasPrefix(url, "http") {
		url = "http://" + url
	}
	asset, err := vs.receiver.GetRemote(url)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		setResponse(w, "error", fmt.Sprintf("%v", err))
		return
	}
	for _, a := range asset {
		vs.appendToPlaylist(a)
		vs.lock.Lock()
		vs.notifications = append(vs.notifications, fmt.Sprintf("El video <b>%s</b> ha sido agregado a la lista de reproducción", a.Name))
		vs.lock.Unlock()
	}

}

func (vs *VideoServer) HttpMethodPut(w http.ResponseWriter, r *http.Request) {
	body := make(map[string]string)
	if e := json.NewDecoder(r.Body).Decode(&body); e != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	status, ok := body["status"]
	if !ok {
		w.WriteHeader(http.StatusBadRequest)
		setResponse(w, "error", "unable to find status key")

		return
	}
	if status == "start" || status == "stop" || status == "play" {
		if status == "start" || status == "play" {
			e := vs.start()
			if e != nil {
				w.WriteHeader(http.StatusBadRequest)
				setResponse(w, "error", fmt.Sprintf("%v", e))

				return
			}
			setResponse(w, "message", "Empezó la reproducción")
		} else {
			e := vs.stop()
			if e != nil {

				setResponse(w, "error", fmt.Sprintf("%v", e))
				w.WriteHeader(http.StatusBadRequest)
				return
			}
			setResponse(w, "message", "Reproducción finalizada")
		}

	} else {
		w.WriteHeader(http.StatusBadRequest)
		setResponse(w, "error", "wrong status, must be start or stop")

		return
	}
}

func (vs *VideoServer) HttpMethodDelete(w http.ResponseWriter, r *http.Request) {
	body := make(map[string]string)
	if e := json.NewDecoder(r.Body).Decode(&body); e != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	value, ok := body["id"]
	if !ok {
		setResponse(w, "error", "id not found in body")
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	vs.lock.Lock()
	if value == "all" {
		if vs.status == "stop" {
			vs.playlist.RemoveAll()
			setResponse(w, "message", "Se borro toda la playlist")
		} else {
			setResponse(w, "message", "No se pudo borrar la playlist porque se encuentra en play")
		}
	} else {
		name := vs.playlist.GetAssetNameById(value)
		b := vs.playlist.Remove(value)
		if b {
			setResponse(w, "message", fmt.Sprintf("Se eliminó <b>%s</b> de la lista de reproducción", name))
		} else {
			setResponse(w, "error", "item no se ha podido eliminar el item")
			w.WriteHeader(http.StatusBadRequest)
		}
	}
	vs.lock.Unlock()
}

func (vs *VideoServer) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "OPTIONS, GET, PUT, PATCH, DELETE")
	switch r.Method {
	case "PATCH":
		// Patch
		vs.HttpMethodPatch(w, r)
	case "DELETE":
		// Delete
		vs.HttpMethodDelete(w, r)
	case "PUT":
		vs.HttpMethodPut(w, r)
	case "POST":
		if r.URL.Path == "/playlist/remote" {
			vs.HttpMethodPost(w, r)
			return
		}
		assets, err := vs.receiver.Recv(r)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		notif := []string{}
		for _, a := range assets {
			vs.appendToPlaylist(a)

			notif = append(notif, fmt.Sprintf("El video <b>%s</b> ha sido agregado a la lista de reproducción", a.Name))

		}
		buf, _ := vs.Json()
		//setResponse(w, "message", "Se agregaron nuevos videos a la reproduccion")

		io.Copy(w, buf)
		vs.lock.Lock()
		vs.notifications = notif
		vs.lock.Unlock()
		//		w.WriteHeader(http.StatusCreated)
	case "OPTIONS":
		return
	case "GET":
		buf, _ := vs.Json()
		io.Copy(w, buf)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func versionHandler(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "OPTIONS, GET, PUT, PATCH, DELETE")
	m := make(map[string]string)
	m["version"] = version
	data, e := json.Marshal(m)
	if e == nil {
		w.Write(data)
	} else {
		setResponse(w, "error", "error encoding version")
	}
}

func main() {

	fmt.Println("SaoVivo start")
	fmt.Println("Creating temporal directory")
	dname, err := os.MkdirTemp("", "saovivo")
	if err != nil {
		fmt.Printf("Error: %v", err)
		return
	}
	fmt.Printf("Working Directory: %s\n", dname)

	download := filepath.Join(dname, "download")
	assets := filepath.Join(dname, "assets")

	if e := os.Mkdir(download, os.ModePerm); e != nil {
		fmt.Printf("Error: %v", err)
		return
	}
	if e := os.Mkdir(assets, os.ModePerm); e != nil {
		fmt.Printf("Error: %v", err)
		return
	}

	if !saovivo.ExistBinaryFile() {
		go func() {
			fmt.Printf("Downloading ffmpeg, wait...\n")
			if _, err := ffbinaries.Download("ffmpeg", "", ""); err != nil {
				fmt.Printf("Error: %v", err)
				return
			}
			fmt.Printf("ffmpeg [Done]\n")
		}()
	}

	if !streaminfo.ExistBinaryFile() {
		go func() {
			fmt.Printf("Downloading ffprobe, wait...\n")
			if _, err := ffbinaries.Download("ffprobe", "", ""); err != nil {
				fmt.Printf("Error: %v", err)
				return
			}
			fmt.Printf("ffprobe [Done]\n")
		}()
	}

	fmt.Println("Starting Server")
	videoServer := NewVideoServer(assets, download)
	mux := http.NewServeMux()
	mux.HandleFunc("/version", versionHandler)
	mux.Handle("/playlist", videoServer)
	mux.Handle("/playlist/remote", videoServer)
	build, err := fs.Sub(build, "build")
	if err != nil {
		fmt.Printf("Error: %v", err)
	}

	port := "4000"
	if runtime.GOOS != "linux" {
		browser := ""
		if runtime.GOOS == "windows" {
			browser = "explorer"
		} else {
			browser = "open"
		}
		fmt.Println("Starting Browser...")
		go func() {
			time.Sleep(5 * time.Second)
			cmd := exec.Command(browser, "http://127.0.0.1:4000")
			cmd.Run()
		}()
		fmt.Println("Wait 10 seconds or go to http://127.0.0.1:4000")

	}

	mux.Handle("/", http.FileServer(http.FS(build)))
	err = http.ListenAndServe(":"+port, mux)
	log.Fatal(err)
}
