package operation

import (
	"net/http"
	"vercel/blob-local/provider"
	"vercel/blob-local/server"

	"github.com/gin-gonic/gin"
)

type List struct {
	provider *provider.ObjectProvider
}

type ListBlobOutput struct {
	Url                string `json:"url"`
	DownloadUrl        string `json:"downloadUrl"`
	Size               int64  `json:"size"`
	UploadedAt         string `json:"uploadedAt"`
	Pathname           string `json:"pathname"`
	ContentDisposition string `json:"contentDisposition"`
	ContentType        string `json:"contentType"`
}

type ListOutput struct {
	Blobs   []ListBlobOutput `json:"blobs"`
	HasMore bool             `json:"hasMore"`
	Cursor  string           `json:"cursor"`
	Folders []string         `json:"folders"`
}

func NewList(p *provider.ObjectProvider) *List {
	return &List{
		provider: p,
	}
}

func (p *List) Handle(c *gin.Context) {

	os, err := p.provider.List(StoreId(c))
	if err != nil {
		server.Debug("List error:", err)
		c.String(http.StatusInternalServerError, "Something went wrong")
		return
	}

	if os == nil {
		c.JSON(200, ListOutput{
			Blobs:   []ListBlobOutput{},
			HasMore: false,
		})
		return
	}

	blobs := make([]ListBlobOutput, len(os))
	for i := range os {
		o := os[i]

		blobs[i] = ListBlobOutput{
			Url:                o.Url,
			DownloadUrl:        o.DownloadUrl,
			Pathname:           o.Pathname,
			ContentType:        o.ContentType,
			ContentDisposition: o.ContentDisposition,
			Size:               o.Size,
			UploadedAt:         o.UploadedAt,
		}
	}

	c.JSON(200, ListOutput{
		Blobs:   blobs,
		HasMore: false,
		// TODO: pagination, folders
	})
}
