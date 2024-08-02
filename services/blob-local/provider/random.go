package provider

import (
	"math/rand"
	"path"
	"strings"
	"time"
)

const charset = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"

func generateRandomString(n int) string {
	seed := rand.NewSource(time.Now().UnixNano())
	r := rand.New(seed)
	b := make([]byte, n)
	for i := range b {
		b[i] = charset[r.Intn(len(charset))]
	}
	return string(b)
}

func AddRandomSuffix(pathname string) string {
	ext := path.Ext(pathname)

	suffix := generateRandomString(30)

	return strings.Replace(pathname, ext, "-"+suffix+ext, 1)
}
