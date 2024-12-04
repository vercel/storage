package server

import (
	"fmt"
	"mime"
	"path"
	"strconv"

	"github.com/gin-gonic/gin"
)

func CreateContentDisposition(pathname string) string {
	filename := path.Base(pathname)

	return "inline; filename=\"" + filename + "\""
}

const oneYearInSeconds = 365 * 24 * 60 * 60
const fiveMinutesInSeconds = 5 * 60

func CreateCacheControl(maxAge string) string {
	num, err := strconv.Atoi(maxAge)
	if err != nil {
		num = oneYearInSeconds
	}

	edge := min(num, fiveMinutesInSeconds)

	return fmt.Sprintf("public, max-age=%d,s-maxage=%d", num, edge)
}

func CreateContentType(contentType string, c *gin.Context, pathname string) string {
	if contentType == "" {
		contentType, _, _ = mime.ParseMediaType(c.Request.Header.Get("content-type"))
	}

	if contentType == "" {
		contentType = mime.TypeByExtension(path.Ext(pathname))
	}

	if contentType == "" {
		contentType = "application/octet-stream"
	}

	return contentType
}
