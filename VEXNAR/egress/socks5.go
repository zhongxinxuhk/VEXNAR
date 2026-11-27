// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

package egress

import (
	"bufio"
	"context"
	"encoding/binary"
	"io"
	"net"
	"time"
)

// SOCKS5 consts (RFC 1928 / RFC 1929).
const (
	socksVer      = 0x05
	socksAuthUser = 0x02
	socksCmdConn  = 0x01

	socksRepOK          = 0x00
	socksRepGeneral     = 0x01
	socksRepNotAllowed  = 0x02
	socksRepHostUnreach = 0x04
	socksRepRefused     = 0x05
	socksRepCmdUnsup    = 0x07
)

// startSocks5 binds a loopback SOCKS5 inlet with username/password auth. It exists
// for tools that only speak SOCKS5 (or a browser profile that can), sharing the
// same sessions, leases and failure semantics as the HTTP gateway.
func (g *Gateway) startSocks5() error {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return err
	}
	g.socksLn = ln
	go func() {
		for {
			conn, err := ln.Accept()
			if err != nil {
				return
			}
			go g.serveSocks5(conn)
		}
	}()
	return nil
}

func (g *Gateway) serveSocks5(conn net.Conn) {
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(30 * time.Second))
	br := bufio.NewReader(conn)

	// Greeting.
	hdr := make([]byte, 2)
	if _, err := io.ReadFull(br, hdr); err != nil || hdr[0] != socksVer {
		return
	}
	methods := make([]byte, int(hdr[1]))
	if _, err := io.ReadFull(br, methods); err != nil {
		return
	}
	offered := false
	for _, m := range methods {
		if m == socksAuthUser {
			offered = true
		}
	}
	if !offered {
		_, _ = conn.Write([]byte{socksVer, 0xFF})
		return
	}
	if _, err := conn.Write([]byte{socksVer, socksAuthUser}); err != nil {
		return
	}

	// RFC 1929 username/password.
	if _, err := io.ReadFull(br, hdr[:2]); err != nil || hdr[0] != 0x01 {
		return
	}
	user := make([]byte, int(hdr[1]))
	if _, err := io.ReadFull(br, user); err != nil {
		return
	}
	plen := make([]byte, 1)
	if _, err := io.ReadFull(br, plen); err != nil {
		return
	}
	pass := make([]byte, int(plen[0]))
	if _, err := io.ReadFull(br, pass); err != nil {
		return
	}
	rt, err := g.mgr.routeFor(string(user), string(pass))
	if err != nil {
		_, _ = conn.Write([]byte{0x01, 0x01})
		return
	}
	if _, err := conn.Write([]byte{0x01, 0x00}); err != nil {
		return
	}

	// CONNECT request.
	// VER, CMD, RSV, ATYP
	req := make([]byte, 4)
	if _, err := io.ReadFull(br, req); err != nil || req[0] != socksVer {
		return
	}
	if req[1] != socksCmdConn {
		_ = writeSocksReply(conn, socksRepCmdUnsup)
		return
	}
	atyp := req[3]
	host, err := readSocksHost(br, atyp)
	if err != nil {
		_ = writeSocksReply(conn, socksRepGeneral)
		return
	}
	pb := make([]byte, 2)
	if _, err := io.ReadFull(br, pb); err != nil {
		return
	}
	target := net.JoinHostPort(host, itoa(binary.BigEndian.Uint16(pb)))

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	st, release, direct, err := g.mgr.acquire(ctx, rt)
	if err != nil {
		_ = writeSocksReply(conn, socksRepFor(err))
		return
	}
	var upstream net.Conn
	if direct {
		d := &net.Dialer{Timeout: 20 * time.Second}
		upstream, err = d.DialContext(ctx, "tcp", target)
	} else {
		upstream, err = st.dialer.DialContext(ctx, "tcp", target)
	}
	if err != nil {
		release(0, 0, 0, err)
		_ = writeSocksReply(conn, socksRepGeneral)
		return
	}
	if err := writeSocksReply(conn, socksRepOK); err != nil {
		upstream.Close()
		release(0, 0, 0, err)
		return
	}
	_ = conn.SetDeadline(time.Time{})

	var up, down int64
	done := make(chan struct{}, 2)
	go func() {
		n, _ := io.Copy(upstream, br)
		up = n
		if c, ok := upstream.(interface{ CloseWrite() error }); ok {
			_ = c.CloseWrite()
		}
		done <- struct{}{}
	}()
	go func() {
		n, _ := io.Copy(conn, upstream)
		down = n
		if c, ok := conn.(interface{ CloseWrite() error }); ok {
			_ = c.CloseWrite()
		}
		done <- struct{}{}
	}()
	<-done
	<-done
	upstream.Close()
	release(200, down, up, nil)
}

func writeSocksReply(w io.Writer, code byte) error {
	// BND.ADDR = 0.0.0.0, BND.PORT = 0: standard "no bind address" reply.
	_, err := w.Write([]byte{socksVer, code, 0x00, 0x01, 0, 0, 0, 0, 0, 0})
	return err
}

func readSocksHost(r io.Reader, atyp byte) (string, error) {
	switch atyp {
	case 0x01:
		b := make([]byte, 4)
		if _, err := io.ReadFull(r, b); err != nil {
			return "", err
		}
		return net.IP(b).String(), nil
	case 0x04:
		b := make([]byte, 16)
		if _, err := io.ReadFull(r, b); err != nil {
			return "", err
		}
		return net.IP(b).String(), nil
	case 0x03:
		l := make([]byte, 1)
		if _, err := io.ReadFull(r, l); err != nil {
			return "", err
		}
		b := make([]byte, int(l[0]))
		if _, err := io.ReadFull(r, b); err != nil {
			return "", err
		}
		return string(b), nil
	default:
		return "", errUnsupportedAtyp
	}
}

type socksError string

func (e socksError) Error() string { return string(e) }

const errUnsupportedAtyp = socksError("socks5: 不支持的地址类型")

func socksRepFor(err error) byte {
	switch {
	case err == nil:
		return socksRepOK
	case isNoNodeErr(err):
		return socksRepNotAllowed
	case err == ErrPoolFull:
		return socksRepGeneral
	default:
		return socksRepGeneral
	}
}

func isNoNodeErr(err error) bool { return err == ErrNoNode || err == ErrNoPool }

func itoa(v uint16) string {
	if v == 0 {
		return "0"
	}
	var buf [5]byte
	i := len(buf)
	for v > 0 {
		i--
		buf[i] = byte('0' + v%10)
		v /= 10
	}
	return string(buf[i:])
}
