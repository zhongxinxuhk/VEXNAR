// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package egress

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
)

// secretBox encrypts node credentials at rest (AES-256-GCM). The key lives next to
// the database with 0600; losing it invalidates stored node passwords, which is
// documented in the design doc (§5.5) rather than silently degrading to plaintext.
type secretBox struct {
	aead cipher.AEAD
}

const secretKeyFile = ".key"

func newSecretBox(dir string) (*secretBox, error) {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, err
	}
	path := filepath.Join(dir, secretKeyFile)
	key, err := os.ReadFile(path)
	switch {
	case err == nil && len(key) == 32:
	case os.IsNotExist(err) || len(key) != 32:
		key = make([]byte, 32)
		if _, err := rand.Read(key); err != nil {
			return nil, fmt.Errorf("egress: 生成密钥失败: %w", err)
		}
		if err := os.WriteFile(path, key, 0o600); err != nil {
			return nil, fmt.Errorf("egress: 写密钥文件失败: %w", err)
		}
	default:
		return nil, fmt.Errorf("egress: 读取密钥文件 %s 失败: %w", path, err)
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &secretBox{aead: aead}, nil
}

// Seal returns nonce||ciphertext, base64-encoded so it can sit in a TEXT column and
// be compared by tests without binary fixtures.
func (b *secretBox) Seal(plain []byte) (string, error) {
	if len(plain) == 0 {
		return "", nil
	}
	nonce := make([]byte, b.aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	ct := b.aead.Seal(nonce, nonce, plain, nil)
	return base64.RawStdEncoding.EncodeToString(ct), nil
}

func (b *secretBox) Open(sealed string) ([]byte, error) {
	if sealed == "" {
		return nil, nil
	}
	raw, err := base64.RawStdEncoding.DecodeString(sealed)
	if err != nil {
		return nil, fmt.Errorf("egress: 密文无法解码: %w", err)
	}
	ns := b.aead.NonceSize()
	if len(raw) < ns {
		return nil, fmt.Errorf("egress: 密文长度异常")
	}
	plain, err := b.aead.Open(nil, raw[:ns], raw[ns:], nil)
	if err != nil {
		return nil, fmt.Errorf("egress: 解密失败（密钥文件可能已被替换）: %w", err)
	}
	return plain, nil
}
