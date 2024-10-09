package provider

import (
	"encoding/json"
	"log"

	"github.com/dgraph-io/badger"
)

type MetadataProvider struct {
	db *badger.DB
}

func NewMetadataProvider(dir string, mode string) *MetadataProvider {
	os := badger.DefaultOptions(dir)
	if mode != "dev" {
		os = os.WithLogger(nil)
	}

	db, err := badger.Open(os)
	if err != nil {
		log.Fatal(err)
	}

	return &MetadataProvider{db}
}

func (p *MetadataProvider) Put(key string, object Object) error {
	err := p.db.Update(func(txn *badger.Txn) error {

		buf, err := json.Marshal(object)
		if err != nil {
			return err
		}

		return txn.Set([]byte(key), buf)
	})

	return err
}

func parseObject(i *badger.Item) (*Object, error) {
	var object *Object

	buf, err := i.ValueCopy(nil)
	if err != nil {
		return nil, err
	}

	err = json.Unmarshal(buf, &object)

	return object, err
}

func (p *MetadataProvider) Get(key string) (*Object, error) {
	var object *Object
	err := p.db.View(func(txn *badger.Txn) error {

		val, err := txn.Get([]byte(key))
		if err != nil || val == nil {
			return err
		}

		o, err := parseObject(val)
		if err != nil {
			return err
		}

		object = o
		return nil
	})

	return object, err
}

func (p *MetadataProvider) Del(key string) error {
	err := p.db.Update(func(txn *badger.Txn) error {

		err := txn.Delete([]byte(key))
		if err != nil {
			return err
		}

		return nil
	})

	return err
}

func (p *MetadataProvider) List(prefix string) ([]Object, error) {

	pre := []byte(prefix)
	var out []Object

	err := p.db.View(func(txn *badger.Txn) error {
		it := txn.NewIterator(badger.DefaultIteratorOptions)
		defer it.Close()

		for it.Seek(pre); it.ValidForPrefix(pre); it.Next() {
			item := it.Item()
			if item == nil {
				return nil
			}

			o, err := parseObject(item)
			if err != nil {
				return err
			}

			out = append(out, *o)
		}

		return nil
	})

	return out, err
}

func (p *MetadataProvider) Close() {
	p.db.Close()
}
