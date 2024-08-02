package main

import (
	"fmt"
	"os"
	"path"
	"vercel/blob-local/operation"
	"vercel/blob-local/provider"
	"vercel/blob-local/server"

	"github.com/gin-gonic/gin"
)

func main() {
	env := server.ENV()
	if env != "dev" {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.Default()
	r.SetTrustedProxies(nil)

	dir := path.Join(os.TempDir(), "blob_fs")

	server.Debug("Using tmp dir: ", dir)

	fp := provider.NewFileProvider(dir)
	mp := provider.NewMetadataProvider(dir, env)
	defer mp.Close()

	op := provider.NewObjectProvider(fp, mp)

	put := operation.NewPut(op)
	head := operation.NewHead(op)
	del := operation.NewDel(op)
	list := operation.NewList(op)
	copy := operation.NewCopy(op)

	authorized := r.Group(operation.BasePath)
	authorized.Use(server.AuthRequired())

	authorized.PUT("/*path", func(c *gin.Context) {
		copyRequest := c.Query("fromUrl")

		if copyRequest == "" {
			put.Handle(c)
		} else {
			copy.Handle(c)
		}
	})

	authorized.GET("/*path", func(c *gin.Context) {

		if c.Query("url") != "" {
			head.Handle(c)
		} else {
			list.Handle(c)
		}
	})

	authorized.POST("/delete", del.Handle)

	download := operation.NewDownload(op)

	r.GET("/public/*rest", download.Handle)

	r.GET("/", func(c *gin.Context) {
		c.Redirect(302, "https://vercel.com/docs/storage/vercel-blob")
	})

	server.Log("starting server on ", server.BaseUrl)

	err := r.Run(":" + server.Port)
	if err != nil {
		panic(fmt.Errorf("Error running server: %w", err))
	}
}
