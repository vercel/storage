package server

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

const (
	StoreId = "storeId"
)

func AuthRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		h := c.Request.Header["Authorization"]
		if len(h) == 0 {
			c.String(http.StatusUnauthorized, "Authorization header is required")
			return
		}

		t := strings.ReplaceAll(h[0], "Bearer ", "")
		p := strings.Split(t, "_")

		if len(p) < 3 {
			c.String(http.StatusUnauthorized, "Mailformed Authorization header")
			return
		}

		c.Set(StoreId, p[3])

		c.Next()
	}
}
