package server

import (
	"fmt"
)

func Log(a ...any) {
	fmt.Print("@vercel/blob: ")
	fmt.Print(a...)
	fmt.Print("\n")
}

func Debug(a ...any) {
	if ENV() != "dev" {
		return
	}

	fmt.Print("@vercel/blob: ")
	fmt.Print(a...)
	fmt.Print("\n")
}
