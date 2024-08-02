package provider

import (
	"errors"
	"io"
	"os"
	"time"
	"vercel/blob-local/server"
)

type Object struct {
	Url                string
	DownloadUrl        string
	Size               int64
	UploadedAt         string
	Pathname           string
	ContentType        string
	ContentDisposition string
	CacheControl       string

	FilePath string
	fp       *FileProvider
}

func (o *Object) GetFile() (*os.File, error) {
	file, err := o.fp.Get(o.FilePath)
	if err != nil {
		return nil, errors.New("GetData Error: " + err.Error())
	}

	return file, nil
}

type ObjectProvider struct {
	fp *FileProvider
	mp *MetadataProvider
}

func NewObjectProvider(fp *FileProvider, mp *MetadataProvider) *ObjectProvider {
	return &ObjectProvider{fp, mp}
}

type PutOptions struct {
	Pathname           string
	Data               io.ReadCloser
	AddRandomSuffix    bool
	ContentType        string
	CacheControlMaxAge string
}

func (p *ObjectProvider) Put(store string, options PutOptions) (*Object, error) {
	pathname := options.Pathname
	if options.AddRandomSuffix {
		pathname = AddRandomSuffix(pathname)
	}

	size, filepath, err := p.fp.Put(store, pathname, options.Data)
	if err != nil {
		return nil, err
	}

	url := server.CreatePublicUrl(store, pathname)

	o := Object{
		// path without random suffix
		Pathname:    options.Pathname,
		Size:        size,
		Url:         url,
		DownloadUrl: server.CreatePublicDownloadUrl(store, pathname),
		// format as ISO 8601
		UploadedAt:         time.Now().Format(time.RFC3339),
		ContentType:        options.ContentType,
		ContentDisposition: server.CreateContentDisposition(options.Pathname),
		CacheControl:       server.CreateCacheControl(options.CacheControlMaxAge),

		FilePath: filepath,
		fp:       p.fp,
	}

	err = p.mp.Put(url, o)
	if err != nil {
		return nil, err
	}

	return &o, nil
}

func (p *ObjectProvider) Get(url string) (*Object, error) {

	o, err := p.mp.Get(url)
	if err != nil {
		return nil, errors.New("GetObject Error: " + err.Error())
	}

	return o, nil
}

func (p *ObjectProvider) Del(urls ...string) {
	for _, url := range urls {

		o, err := p.mp.Get(url)
		if err != nil {
			continue
		}

		err = p.mp.Del(url)
		if err != nil {
			continue
		}

		p.fp.Del(o.FilePath)
	}
}

func (p ObjectProvider) List(store string) ([]Object, error) {
	prefix := server.CreatePublicUrl(store, "")

	o, err := p.mp.List(prefix)
	if err != nil {
		return nil, err
	}

	return o, nil
}

type CopyOptions struct {
	Pathname           string
	AddRandomSuffix    bool
	ContentType        string
	CacheControlMaxAge string
}

func (p ObjectProvider) Copy(store string, from string, options CopyOptions) (*Object, error) {
	fromO, err := p.mp.Get(from)
	if err != nil || fromO == nil {
		return nil, err
	}

	file, err := p.fp.Get(fromO.FilePath)
	if err != nil || file == nil {
		return nil, err
	}

	o, err := p.Put(store, PutOptions{
		Pathname:           options.Pathname,
		Data:               file,
		AddRandomSuffix:    options.AddRandomSuffix,
		ContentType:        options.ContentType,
		CacheControlMaxAge: options.CacheControlMaxAge,
	})

	if err != nil {
		return nil, err
	}

	return o, nil
}
