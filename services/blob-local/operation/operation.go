package operation

import (
	"errors"
	"strings"
	"vercel/blob-local/server"

	"github.com/gin-gonic/gin"
)

const (
	BasePath = "/api/"
)

func FormatApiPath(pathname string) string {
	return strings.Replace(pathname, BasePath, "", 1)
}

func StoreId(c *gin.Context) string {
	i := c.GetString(server.StoreId)
	if i == "" {
		panic(errors.New("missing storeId in context"))
	}

	return i
}
