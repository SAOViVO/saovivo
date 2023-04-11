package saovivo

import (
	"log"
	"os"
)

var (
	lout *log.Logger
	lerr *log.Logger
)

func init() {
	lout = log.New(os.Stdout, "-- INFO  -- ", log.Ldate|log.Ltime|log.Lmicroseconds)
	lerr = log.New(os.Stderr, "-- ERROR -- ", log.Ldate|log.Ltime|log.Lmicroseconds)
}
