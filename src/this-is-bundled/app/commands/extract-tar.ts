export const extract = {
	handleExtractTarGz(args) {
		if (!args.length) {
			this.writeStderr('extract-targz: missing operand\n')
			return
		}
		const [sourceArg, targetArg] = args
		const resolvedSource = this.resolvePath(sourceArg)
		const resolvedTarget = this.resolvePath(targetArg)

		let sourceStats
		try {
			sourceStats = globalFs.statSync(resolvedSource)
			if (!sourceStats.isFile()) {
				this.writeStderr(
					`extract-targz: ${sourceArg}: Not a file\n`
				)
				return
			}
		} catch (error) {
			this.writeStderr(
				`${this.formatFsError(
					'extract-targz',
					sourceArg,
					error
				)}\n`
			)
			return
		}

		try {
			const targetStats = globalFs.statSync(resolvedTarget)
			if (!targetStats.isDirectory()) {
				this.writeStderr(
					`extract-targz: ${
						targetArg ?? '.'
					}: Not a directory\n`
				)
				return
			}
		} catch (error) {
			if (error && error.code === 'ENOENT') {
				try {
					globalFs.mkdirSync(resolvedTarget, {
						recursive: true,
					})
				} catch (mkdirError) {
					this.writeStderr(
						`${this.formatFsError(
							'extract-targz',
							targetArg ?? '.',
							mkdirError
						)}\n`
					)
					return
				}
			} else if (error) {
				this.writeStderr(
					`${this.formatFsError(
						'extract-targz',
						targetArg ?? '.',
						error
					)}\n`
				)
				return
			}
		}

		let archiveData
		try {
			archiveData = globalFs.readFileSync(resolvedSource)
		} catch (error) {
			this.writeStderr(
				`${this.formatFsError(
					'extract-targz',
					sourceArg,
					error
				)}\n`
			)
			return
		}

		const zlib = globalThis.coreModules?.zlib
		if (!zlib || typeof zlib.gunzipSync !== 'function') {
			this.writeStderr(
				'extract-targz: zlib module is not available\n'
			)
			return
		}

		let tarBuffer
		try {
			const compressed = Buffer.isBuffer(archiveData)
				? archiveData
				: Buffer.from(archiveData)
			tarBuffer = zlib.gunzipSync(compressed)
		} catch (error) {
			this.writeStderr(
				`extract-targz: failed to decompress archive (${error.message})\n`
			)
			return
		}

		try {
			const result = this.extractTarArchive(
				tarBuffer,
				resolvedTarget
			)
			let message = `extract-targz: extracted ${
				result.files
			} file${result.files === 1 ? '' : 's'}`
			if (result.dirs > 0) {
				message += ` and ${result.dirs} director${
					result.dirs === 1 ? 'y' : 'ies'
				}`
			}
			if (result.skipped > 0) {
				message += ` (${result.skipped} entr${
					result.skipped === 1 ? 'y' : 'ies'
				} skipped)`
			}
			message += ` into ${targetArg ?? '.'}`
			this.writeStdout(`${message}\n`)
		} catch (error) {
			const rawMessage =
				error && typeof error.message === 'string'
					? error.message
					: String(error)
			if (rawMessage.startsWith('extract-targz:')) {
				this.writeStderr(`${rawMessage}\n`)
			} else {
				this.writeStderr(`extract-targz: ${rawMessage}\n`)
			}
		}
	}

	extractTarArchive(tarBuffer, destination) {
		const BLOCK_SIZE = 512
		let offset = 0
		let files = 0
		let dirs = 0
		let skipped = 0
		let pendingLongName = null
		let pendingPax = null
		const globalPax = {}
		const baseParts =
			destination === '/'
				? []
				: destination.split('/').filter(Boolean)
		const baseDepth = baseParts.length

		while (offset + BLOCK_SIZE <= tarBuffer.length) {
			const header = tarBuffer.subarray(
				offset,
				offset + BLOCK_SIZE
			)
			if (this.isTarZeroBlock(header)) {
				break
			}

			let typeFlag = header[156]
			if (typeFlag === 0) {
				typeFlag = '0'.charCodeAt(0)
			}
			const typeChar = String.fromCharCode(typeFlag)
			const size = this.parseTarSize(
				header.subarray(124, 136)
			)
			const prefix = this.readTarString(header, 345, 155)
			let name =
				pendingLongName ??
				this.readTarString(header, 0, 100)
			pendingLongName = null

			if (prefix) {
				name = `${prefix}/${name}`
			}
			if (typeChar === 'L') {
				const data = tarBuffer.subarray(
					offset + BLOCK_SIZE,
					offset + BLOCK_SIZE + size
				)
				pendingLongName = this.bufferToString(data).replace(
					/\n$/,
					''
				)
				offset +=
					BLOCK_SIZE +
					this.roundUpToBlock(size, BLOCK_SIZE)
				continue
			}
			if (typeChar === 'K') {
				offset +=
					BLOCK_SIZE +
					this.roundUpToBlock(size, BLOCK_SIZE)
				continue
			}
			if (typeChar === 'x' || typeChar === 'g') {
				const data = tarBuffer.subarray(
					offset + BLOCK_SIZE,
					offset + BLOCK_SIZE + size
				)
				const parsed = this.parsePaxHeader(data)
				if (typeChar === 'g') {
					Object.assign(globalPax, parsed)
				} else {
					pendingPax = parsed
				}
				offset +=
					BLOCK_SIZE +
					this.roundUpToBlock(size, BLOCK_SIZE)
				continue
			}

			const paxAttributes = { ...globalPax }
			if (pendingPax) {
				Object.assign(paxAttributes, pendingPax)
			}

			if (paxAttributes.path) {
				name = paxAttributes.path
			}
			name = name.replace(/^\/+/, '')

			const targetPath = this.joinTarEntryPath(
				baseParts,
				baseDepth,
				name
			)
			const dataStart = offset + BLOCK_SIZE
			const dataEnd = dataStart + size
			if (dataEnd > tarBuffer.length) {
				throw new Error('archive data is truncated')
			}
			switch (typeChar) {
				case '5': {
					if (!targetPath) {
						skipped++
						break
					}
					try {
						if (!globalFs.existsSync(targetPath)) {
							globalFs.mkdirSync(targetPath, {
								recursive: true,
							})
							dirs++
						}
					} catch (error) {
						throw new Error(
							this.formatFsError(
								'extract-targz',
								targetPath,
								error
							)
						)
					}
					break
				}
				case '0':
				case '\0':
				case '7':
				case '': {
					if (!targetPath) {
						skipped++
						break
					}
					if (name.endsWith('/')) {
						try {
							if (!globalFs.existsSync(targetPath)) {
								globalFs.mkdirSync(targetPath, {
									recursive: true,
								})
								dirs++
							}
						} catch (error) {
							throw new Error(
								this.formatFsError(
									'extract-targz',
									targetPath,
									error
								)
							)
						}
						break
					}
					const directory =
						this.dirnameFromPath(targetPath)
					try {
						if (directory) {
							globalFs.mkdirSync(directory, {
								recursive: true,
							})
						}
						const fileData = tarBuffer.subarray(
							dataStart,
							dataEnd
						)
						globalFs.writeFileSync(targetPath, fileData)
						files++
					} catch (error) {
						throw new Error(
							this.formatFsError(
								'extract-targz',
								targetPath,
								error
							)
						)
					}
					break
				}
				case '1':
				case '2':
				case '3':
				case '4':
				case '6':
				case 'g':
				case 'x':
				default:
					skipped++
					break
			}

			const totalSize = this.roundUpToBlock(size, BLOCK_SIZE)
			offset += BLOCK_SIZE + totalSize
			pendingPax = null
		}

		return { files, dirs, skipped }
	}

	readTarString(buffer, start, length) {
		const slice = buffer.subarray(start, start + length)
		const str = Buffer.from(slice).toString('utf8')
		return str.replace(/\0.*$/, '')
	}

	parseTarSize(buffer) {
		if ((buffer[0] & 0x80) !== 0) {
			const bytes = Uint8Array.from(buffer)
			bytes[0] &= 0x7f
			let value = 0n
			for (let i = 0; i < bytes.length; i++) {
				value = (value << 8n) | BigInt(bytes[i])
			}
			return Number(value)
		}
		const str = Buffer.from(buffer)
			.toString('utf8')
			.replace(/\0.*$/, '')
			.trim()
		if (!str) {
			return 0
		}
		const parsed = parseInt(str, 8)
		return Number.isNaN(parsed) ? 0 : parsed
	}

	roundUpToBlock(size, blockSize) {
		if (size === 0) {
			return 0
		}
		return Math.ceil(size / blockSize) * blockSize
	}

	isTarZeroBlock(block) {
		for (let i = 0; i < block.length; i++) {
			if (block[i] !== 0) {
				return false
			}
		}
		return true
	}

	joinTarEntryPath(baseParts, baseDepth, entryName) {
		if (!entryName) {
			return null
		}
		const cleaned = entryName.replace(/\\/g, '/')
		const parts = cleaned.split('/')
		const targetParts = baseParts.slice()
		for (const part of parts) {
			if (!part || part === '.') {
				continue
			}
			if (part === '..') {
				if (targetParts.length > baseDepth) {
					targetParts.pop()
					continue
				}
				return null
			}
			targetParts.push(part)
		}
		if (targetParts.length === baseDepth) {
			return null
		}
		return `/${targetParts.join('/')}`
	}

	dirnameFromPath(path) {
		if (!path || path === '/') {
			return null
		}
		const parts = path.split('/').filter(Boolean)
		if (parts.length <= 1) {
			return path.startsWith('/') ? null : null
		}
		parts.pop()
		const joined = `/${parts.join('/')}`
		return joined === '/' ? null : joined
	}

	bufferToString(data, stripNull = true) {
		let str = Buffer.from(data).toString('utf8')
		if (stripNull) {
			str = str.replace(/\0+$/, '')
		}
		return str
	}

	parsePaxHeader(data) {
		const entries = {}
		const text = this.bufferToString(data, false)
		let index = 0
		while (index < text.length) {
			const spaceIndex = text.indexOf(' ', index)
			if (spaceIndex === -1) {
				break
			}
			const lengthText = text.slice(index, spaceIndex)
			const recordLength = parseInt(lengthText, 10)
			if (
				!Number.isFinite(recordLength) ||
				recordLength <= 0
			) {
				break
			}
			const record = text.slice(
				spaceIndex + 1,
				index + recordLength - 1
			)
			const equalsIndex = record.indexOf('=')
			if (equalsIndex !== -1) {
				const key = record.slice(0, equalsIndex)
				const value = record.slice(equalsIndex + 1)
				entries[key] = value
			}
			index += recordLength
		}
		return entries
	}

}