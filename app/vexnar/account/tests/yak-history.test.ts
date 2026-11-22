// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { Server, ServerCredentials, type handleUnaryCall, type MethodDefinition } from '@grpc/grpc-js'
import protobuf from 'protobufjs'

test('the built reader lists and opens stored flows over a private Unix socket', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vx-yak-'))
  const socket = join(directory, 'grpc.sock')
  const configuration = join(directory, 'sources.json')
  const tokenFile = join(directory, 'token')
  const previous = process.env.VEXNAR_YAK_HISTORY_CONFIG
  const server = new Server()
  const protoFile = new URL('../lib/yak-history.proto', import.meta.url)
  const { handleYakHistory } = await import(new URL('../lib/yak-history.js', import.meta.url).href) as typeof import('../src/yak-history.ts')
  const call = (body: object) => handleYakHistory(new Request('http://127.0.0.1/api/yak/history', {
    method: 'POST', body: JSON.stringify(body)
  }))
  try {
    delete process.env.VEXNAR_YAK_HISTORY_CONFIG
    assert.deepEqual(await (await call({ action: 'sources' })).json(), { sources: [] })
    process.env.VEXNAR_YAK_HISTORY_CONFIG = configuration
    await writeFile(configuration, JSON.stringify([{ name: 'fixture', workspace: directory, socket,
      token_file: tokenFile, project_id: 42 }]))
    await writeFile(tokenFile, 'local-test-token\n', { mode: 0o600 })
    const wire = protobuf.parse(await readFile(protoFile, 'utf8'), { keepCase: true }).root
    const service: Record<string, MethodDefinition<Record<string, unknown>, object>> = {}
    const handlers: Record<string, handleUnaryCall<Record<string, unknown>, object>> = {}
    const id = '9007199254740993'
    const flow = { id, url: 'https://fixture.invalid/', method: 'GET', status_code: 200,
      request: Buffer.from('GET / HTTP/1.1\r\n\r\n'), response: Buffer.alloc((128 << 10) + 1, 0x61) }
    const checks: string[] = []
    let changedAfterRead = false
    let details = 0
    const results: Record<string, (input: Record<string, unknown>) => object> = {
      GetCurrentProjectEx: input => {
        assert.equal(input.type, 'project')
        return { id: changedAfterRead && details > 1 ? 99 : 42 }
      },
      QueryHTTPFlows: input => {
        assert.deepEqual(input.pagination, { page: '2', limit: '50', order_by: 'status_code', order: 'asc' })
        assert.equal(input.search_url, 'fixture.invalid')
        assert.deepEqual(input.tags, ['cached'])
        return { data: [flow], total: 1 }
      },
      GetHTTPFlowById: input => {
        assert.equal(input.id, id)
        details += 1
        return flow
      }
    }
    for (const [method, requestName, responseName] of [
      ['GetCurrentProjectEx', 'GetCurrentProjectExRequest', 'ProjectDescription'],
      ['QueryHTTPFlows', 'QueryHTTPFlowRequest', 'QueryHTTPFlowResponse'],
      ['GetHTTPFlowById', 'GetHTTPFlowByIdRequest', 'HTTPFlow']
    ] as const) {
      const input = wire.lookupType('ypb.' + requestName)
      const output = wire.lookupType('ypb.' + responseName)
      service[method] = {
        path: '/ypb.Yak/' + method, requestStream: false, responseStream: false,
        requestSerialize: data => Buffer.from(input.encode(input.fromObject(data)).finish()),
        requestDeserialize: data => input.toObject(input.decode(data), { longs: String }),
        responseSerialize: data => Buffer.from(output.encode(output.fromObject(data)).finish()),
        responseDeserialize: data => output.toObject(output.decode(data), { longs: String })
      }
      handlers[method] = (request, callback) => {
        assert.deepEqual(request.metadata.get('authorization'), ['Bearer local-test-token'])
        checks.push(method)
        callback(null, results[method]!(request.request))
      }
    }
    server.addService(service, handlers)
    await new Promise<void>((resolve, reject) => {
      server.bindAsync('unix:' + socket, ServerCredentials.createInsecure(), error => error ? reject(error) : resolve())
    })
    await chmod(socket, 0o600)
    assert.deepEqual(await (await call({ action: 'sources' })).json(), { sources: ['fixture'] })
    const list = await call({ action: 'list', workspace: directory, url: 'fixture.invalid', page: 2,
      order_by: 'status_code', ascending: true, tag: 'cached' })
    assert.equal(list.status, 200)
    const page = await list.json()
    assert.equal(page.rows[0].id, id)
    assert.deepEqual(checks, ['GetCurrentProjectEx', 'QueryHTTPFlows', 'GetCurrentProjectEx'])

    const detail = await call({ action: 'detail', source: 'fixture', id })
    assert.equal(detail.status, 200)
    assert.equal(detail.headers.get('cache-control'), 'no-store')
    const body = await detail.json()
    assert.equal(body.request.text, flow.request.toString())
    assert.equal(body.response.bytes, flow.response.length)
    assert.equal(Buffer.from(body.response.base64, 'base64').length, 128 << 10)
    assert.equal(body.response.truncated, true)
    assert.equal((await call({ action: 'detail', source: 'fixture', workspace: join(directory, 'other'), id })).status, 409)
    assert.equal((await call({ action: 'detail', source: 'fixture', id, agent: true })).status, 400)

    changedAfterRead = true
    const changed = await call({ action: 'detail', source: 'fixture', id })
    assert.equal(changed.status, 409)
    assert.equal('flow' in await changed.json(), false)
    await chmod(tokenFile, 0o644)
    assert.equal((await call({ action: 'detail', source: 'fixture', id })).status, 502)
  } finally {
    server.forceShutdown()
    await rm(directory, { recursive: true, force: true })
    if (previous === undefined) delete process.env.VEXNAR_YAK_HISTORY_CONFIG
    else process.env.VEXNAR_YAK_HISTORY_CONFIG = previous
  }
})
