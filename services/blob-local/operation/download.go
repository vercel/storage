package operation

import (
	"net/http"
	"strings"
	"time"
	"vercel/blob-local/provider"
	"vercel/blob-local/server"

	"github.com/gin-gonic/gin"
)

type Download struct {
	provider *provider.ObjectProvider
}

func NewDownload(p *provider.ObjectProvider) *Download {
	return &Download{
		provider: p,
	}
}

func (d *Download) setContentDisposition(c *gin.Context, object *provider.Object) {
	contentDisposition := "inline"
	if object.ContentDisposition != "" {
		contentDisposition = object.ContentDisposition
	}
	if c.Query("download") == "1" {
		contentDisposition = strings.Replace(contentDisposition, "inline", "attachment", 1)
	}

	c.Header("Content-Disposition", contentDisposition)
}

func (d *Download) Handle(c *gin.Context) {

	publicUrl := server.BaseUrl + c.Request.URL.Path

	object, err := d.provider.Get(publicUrl)
	if err != nil {
		server.Debug("Download error:", err)

		c.String(http.StatusNotFound, "Blob not found")
		return
	}

	file, err := object.GetFile()
	if err != nil {
		server.Debug("Download error:", err)

		c.String(http.StatusNotFound, "Blob not found")
		return
	}

	defer file.Close()

	d.setContentDisposition(c, object)

	modtime, _ := time.Parse(time.RFC3339, object.UploadedAt)

	http.ServeContent(
		c.Writer,
		c.Request,
		object.Pathname,
		modtime,
		file,
	)
}
