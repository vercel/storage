package operation

import (
	"net/http"
	"net/url"
	"vercel/blob-local/provider"
	"vercel/blob-local/server"

	"github.com/gin-gonic/gin"
)

type Head struct {
	provider *provider.ObjectProvider
}

type HeadOutput struct {
	Url                string `json:"url"`
	DownloadUrl        string `json:"downloadUrl"`
	Size               int64  `json:"size"`
	UploadedAt         string `json:"uploadedAt"`
	Pathname           string `json:"pathname"`
	ContentType        string `json:"contentType"`
	ContentDisposition string `json:"contentDisposition"`
	CacheControl       string `json:"cacheControl"`
}

func NewHead(p *provider.ObjectProvider) *Head {
	return &Head{
		provider: p,
	}
}

func (p *Head) Handle(c *gin.Context) {

	u := c.Query("url")

	_, err := url.Parse(u)
	if err != nil {
		c.AbortWithError(500, err)
	}

	o, err := p.provider.Get(u)

	if err != nil {
		server.Debug("GetObject error:", err)

		c.String(http.StatusNotFound, "Blob not found")
		return
	}

	c.JSON(200, HeadOutput{
		Url:                o.Url,
		DownloadUrl:        o.DownloadUrl,
		Size:               o.Size,
		UploadedAt:         o.UploadedAt,
		Pathname:           o.Pathname,
		ContentType:        o.ContentType,
		ContentDisposition: o.ContentDisposition,
		CacheControl:       o.CacheControl,
	})
}
