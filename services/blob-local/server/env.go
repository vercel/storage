package server

import "os"

func ENV() string {
	return os.Getenv("ENV")
}
