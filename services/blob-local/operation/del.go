package operation

import (
	"net/http"
	"vercel/blob-local/provider"
	"vercel/blob-local/server"

	"github.com/gin-gonic/gin"
)

type Del struct {
	provider *provider.ObjectProvider
}

type Body struct {
	Urls []string `json:"urls"`
}

func NewDel(p *provider.ObjectProvider) *Del {
	return &Del{
		provider: p,
	}
}

func (p *Del) Handle(c *gin.Context) {

	var input Body

	if err := c.ShouldBindJSON(&input); err != nil {
		server.Debug("Body error:", err)

		c.String(http.StatusBadRequest, "Wrong body")
		return
	}

	p.provider.Del(input.Urls...)

	c.JSON(200, gin.H{})
}
