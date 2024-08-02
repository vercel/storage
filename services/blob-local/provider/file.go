package provider

import (
	"fmt"
	"io"
	"os"
	"path"
)

const (
	// read, write, and execute permissions
	Permissions = 0755
)

type FileProvider struct {
	dir string
}

func NewFileProvider(dir string) *FileProvider {

	err := os.MkdirAll(dir, Permissions)
	if err != nil {
		panic(fmt.Errorf("Error creating temporary directory: %w", err))
	}

	return &FileProvider{dir}
}

func (p *FileProvider) Put(store string, pathname string, data io.ReadCloser) (int64, string, error) {
	relPath := path.Join(store, pathname)
	pathname = path.Join(p.dir, relPath)

	err := os.MkdirAll(path.Dir(pathname), 0755)
	if err != nil {
		return 0, "", err
	}

	outFile, err := os.Create(pathname)
	if err != nil {
		return 0, "", err
	}

	defer outFile.Close()
	size, err := io.Copy(outFile, data)

	return size, relPath, err
}

func (p *FileProvider) Del(pathname string) error {
	name := path.Join(p.dir, pathname)

	return os.Remove(name)
}

func (p *FileProvider) Get(pathname string) (*os.File, error) {
	name := path.Join(p.dir, pathname)

	file, err := os.Open(name)

	if err != nil {
		return nil, err
	}

	return file, nil
}
