package operation

import (
	"net/http"
	"vercel/blob-local/provider"
	"vercel/blob-local/server"

	"github.com/gin-gonic/gin"
)

type Copy struct {
	provider *provider.ObjectProvider
}

type CopyOutput struct {
	Url                string `json:"url"`
	DownloadUrl        string `json:"downloadUrl"`
	Pathname           string `json:"pathname"`
	ContentType        string `json:"contentType"`
	ContentDisposition string `json:"contentDisposition"`
}

func NewCopy(p *provider.ObjectProvider) *Copy {
	return &Copy{
		provider: p,
	}
}

func (p *Copy) Handle(c *gin.Context) {

	fromUrl := c.Query("fromUrl")
	if fromUrl == "" {
		c.String(http.StatusBadRequest, "Missing 'url' query parameter")
		return
	}

	pathname := FormatApiPath(c.Request.URL.Path)

	addRandomSuffix := c.Request.Header.Get("x-add-random-suffix") == "1"
	contentType := server.CreateContentType(c.Request.Header.Get("x-content-type"), c, pathname)

	o, err := p.provider.Copy(StoreId(c), fromUrl, provider.CopyOptions{
		Pathname:           pathname,
		AddRandomSuffix:    addRandomSuffix,
		ContentType:        contentType,
		CacheControlMaxAge: c.Request.Header.Get("x-cache-control-max-age"),
	})

	if err != nil {
		server.Debug("Copy error:", err)

		c.String(http.StatusNotFound, "From blob doesn't exist")
		return
	}

	c.JSON(200, CopyOutput{
		Url:                o.Url,
		DownloadUrl:        o.DownloadUrl,
		Pathname:           o.Pathname,
		ContentType:        o.ContentType,
		ContentDisposition: o.ContentDisposition,
	})
}
