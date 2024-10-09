package server

import (
	"path"
)

const (
	Port           = "3001"
	PublicBasePath = "/public"
	Scheme         = "http"
	Host           = "localhost"
	BaseUrl        = Scheme + "://" + Host + ":" + Port
)

func CreatePublicUrl(store string, pathname string) string {
	return BaseUrl + path.Join(PublicBasePath, store, pathname)
}

func CreatePublicDownloadUrl(store string, pathname string) string {
	return CreatePublicUrl(store, pathname) + "?download=1"
}
