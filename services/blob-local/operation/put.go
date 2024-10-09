package operation

import (
	"net/http"
	"vercel/blob-local/provider"
	"vercel/blob-local/server"

	"github.com/gin-gonic/gin"
)

type Put struct {
	provider *provider.ObjectProvider
}

type PutOutput struct {
	Url                string `json:"url"`
	DownloadUrl        string `json:"downloadUrl"`
	Pathname           string `json:"pathname"`
	ContentType        string `json:"contentType"`
	ContentDisposition string `json:"contentDisposition"`
}

func NewPut(p *provider.ObjectProvider) *Put {
	return &Put{
		provider: p,
	}
}

func (p *Put) Handle(c *gin.Context) {

	pathname := FormatApiPath(c.Request.URL.Path)

	addRandomSuffix := c.Request.Header.Get("x-add-random-suffix") == "1"
	contentType := server.CreateContentType(c.Request.Header.Get("x-content-type"), c, pathname)

	o, err := p.provider.Put(StoreId(c), provider.PutOptions{
		Pathname:           pathname,
		Data:               c.Request.Body,
		AddRandomSuffix:    addRandomSuffix,
		ContentType:        contentType,
		CacheControlMaxAge: c.Request.Header.Get("x-cache-control-max-age"),
	})

	if err != nil {
		server.Debug("Put error:", err)

		c.String(http.StatusInternalServerError, "Something went wrong")
		return
	}

	c.JSON(200, PutOutput{
		Url:                o.Url,
		DownloadUrl:        o.DownloadUrl,
		Pathname:           o.Pathname,
		ContentType:        o.ContentType,
		ContentDisposition: o.ContentDisposition,
	})
}
