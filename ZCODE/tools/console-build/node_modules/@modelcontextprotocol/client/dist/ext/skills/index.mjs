import { Nt as SdkError, Pt as SdkErrorCode, tt as isModernProtocolVersion } from "../../src-CeKsbNLO.mjs";
import { n as clientInternals } from "../../public-CvV4ZHkX.mjs";
import * as z from "zod/v4";
import { DIRECTORY_MIME_TYPE, RESOURCES_DIRECTORY_READ_METHOD, RESOURCES_DIRECTORY_READ_METHOD as RESOURCES_DIRECTORY_READ_METHOD$1, ReadResourceDirectoryResultSchema, SKILLS_EXTENSION_ID, SKILLS_EXTENSION_ID as SKILLS_EXTENSION_ID$1, SKILLS_GET_METHOD, SKILLS_GET_METHOD as SKILLS_GET_METHOD$1, SKILLS_LIST_METHOD, SKILLS_LIST_METHOD as SKILLS_LIST_METHOD$1, SKILL_LIMITS, SkillSchema, skillsCapabilityOf } from "@modelcontextprotocol/core/ext/skills";

//#region src/ext/skills/errors.ts
/**
* A skill file failed verification against its skill entry: not listed,
* wrong size, wrong digest, or (for `SKILL.md`) frontmatter that differs from
* the entry. Hosts must not load the file; for `SKILL.md`, not the skill.
*/
var SkillVerificationError = class extends SdkError {
	static {
		Object.defineProperty(this, "mcpBrand", { value: "mcp.SkillVerificationError" });
	}
	reason;
	uri;
	/** For `frontmatter`: one line per differing field. */
	differences;
	constructor(reason, uri, message, differences = [], options) {
		super(SdkErrorCode.InvalidResult, message, {
			reason,
			uri,
			differences
		}, options);
		this.name = "SkillVerificationError";
		this.reason = reason;
		this.uri = uri;
		this.differences = differences;
	}
};

//#endregion
//#region ../core-internal/src/ext/skills/bytes.ts
const encoder = new TextEncoder();
/** UTF-8 bytes of `text`. */
function encodeUtf8(text) {
	return encoder.encode(text);
}
/** Decodes UTF-8 only if decoding loses nothing (a BOM is kept); otherwise `undefined`. */
function decodeUtf8Lossless(bytes) {
	try {
		return new TextDecoder("utf-8", {
			fatal: true,
			ignoreBOM: true
		}).decode(bytes);
	} catch {
		return;
	}
}
/** Bytes of a standard base64 string. */
function decodeBase64(base64) {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index++) bytes[index] = binary.codePointAt(index);
	return bytes;
}
/** `sha256:` followed by the lowercase hex SHA-256 of `bytes` (WebCrypto, every runtime). */
async function sha256Digest(bytes) {
	const { buffer, byteOffset, byteLength } = bytes;
	const view = buffer instanceof ArrayBuffer ? new Uint8Array(buffer, byteOffset, byteLength) : new Uint8Array(bytes);
	const hash = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", view));
	let hex = "";
	for (const byte of hash) hex += byte.toString(16).padStart(2, "0");
	return `sha256:${hex}`;
}

//#endregion
//#region ../core-internal/src/ext/skills/frontmatter.ts
/**
* Frontmatter reader for `SKILL.md` (SEP-2640).
*
* Reads the YAML subset real skills use — block mappings and sequences;
* plain, quoted and block scalars; one-line flow collections; comments — with
* YAML 1.2 core-schema typing. Anything outside the subset throws a
* {@linkcode FrontmatterError} instead of being read differently from a full
* YAML parser. Server catalogs and client verification both call it; it is
* kept behind this module so it can be swapped for a YAML library.
*/
var FrontmatterError = class extends Error {
	line;
	constructor(message, line) {
		super(line === void 0 ? message : `line ${line}: ${message}`);
		this.name = "FrontmatterError";
		this.line = line;
	}
};
const MAX_DEPTH = 32;
/** Splits `SKILL.md` into its frontmatter YAML and markdown body. */
function splitFrontmatter(markdown) {
	let text = markdown.replaceAll("\r\n", "\n");
	if (text.codePointAt(0) === 65279) text = text.slice(1);
	if (!text.startsWith("---\n")) throw new FrontmatterError("SKILL.md must begin with a \"---\" line", 1);
	const rest = text.slice(4);
	const close = /^---[\t ]*$/m.exec(rest);
	if (close === null) throw new FrontmatterError("frontmatter has no closing \"---\" line");
	let body = rest.slice(close.index + close[0].length);
	if (body.startsWith("\n")) body = body.slice(1);
	return {
		yaml: rest.slice(0, close.index),
		body
	};
}
/** Splits and parses `SKILL.md`. Line numbers in errors count from the file's first line. */
function parseSkillMarkdown(markdown) {
	const { yaml, body } = splitFrontmatter(markdown);
	return {
		frontmatter: parseFrontmatterYaml(yaml, 2),
		body
	};
}
/** Parses frontmatter YAML into a JSON object. `firstLine` numbers the first YAML line in errors. */
function parseFrontmatterYaml(yaml, firstLine = 1) {
	return new Parser(toLines(yaml, firstLine)).parseDocument();
}
function toLines(yaml, firstLine) {
	const raws = yaml.split("\n");
	if (raws.at(-1) === "") raws.pop();
	return raws.map((raw, index) => ({
		no: firstLine + index,
		indent: /^ */.exec(raw)?.[0].length ?? 0,
		text: trimWhiteStart(raw),
		raw
	}));
}
const TAB_INDENT = "tabs cannot be used for indentation";
const isSkippable = (line) => line.text === "" || line.text.startsWith("#");
const isTabIndented = (line) => line.raw[line.indent] === "	";
const isSequenceItem = (text) => /^-(?:[\t ]|$)/.test(text);
var Parser = class {
	index = 0;
	constructor(lines) {
		this.lines = lines;
	}
	parseDocument() {
		const first = this.peek();
		if (first === void 0) return {};
		if (first.text.startsWith("﻿")) throw new FrontmatterError("a byte order mark inside the frontmatter is not supported", first.no);
		if (isSequenceItem(first.text) || matchKey(first.text, first.no) === void 0) throw new FrontmatterError("frontmatter must be a mapping of keys to values", first.no);
		const map = this.parseMapping(first.indent, 0);
		const extra = this.peek();
		if (extra !== void 0) throw new FrontmatterError("unexpected content", extra.no);
		return map;
	}
	peek() {
		while (this.index < this.lines.length && isSkippable(this.lines[this.index])) this.index++;
		const line = this.lines[this.index];
		if (line !== void 0 && isTabIndented(line)) throw new FrontmatterError(TAB_INDENT, line.no);
		return line;
	}
	parseMapping(indent, depth) {
		assertDepth(depth, this.lines[this.index]?.no);
		const map = {};
		for (let line = this.peek(); line !== void 0 && line.indent >= indent; line = this.peek()) {
			if (line.indent > indent) throw new FrontmatterError("unexpected indentation", line.no);
			if (isSequenceItem(line.text)) break;
			const match = matchKey(line.text, line.no);
			if (match === void 0) throw new FrontmatterError("expected \"key: value\"", line.no);
			if (Object.hasOwn(map, match.key)) throw new FrontmatterError(`duplicate key "${match.key}"`, line.no);
			this.index++;
			map[match.key] = this.parseValue(match.rest, line, indent, depth + 1, true);
		}
		return map;
	}
	parseSequence(indent, depth) {
		assertDepth(depth, this.lines[this.index]?.no);
		const items = [];
		for (let line = this.peek(); line !== void 0 && line.indent >= indent; line = this.peek()) {
			if (line.indent > indent) throw new FrontmatterError("unexpected indentation", line.no);
			if (!isSequenceItem(line.text)) break;
			const after = line.text.slice(1);
			const rest = trimWhiteStart(after);
			const column = line.indent + 1 + (after.length - rest.length);
			if (rest !== "" && !rest.startsWith("#") && (isSequenceItem(rest) || matchKey(rest, line.no) !== void 0)) {
				if (/^ *\t/.test(after)) throw new FrontmatterError(TAB_INDENT, line.no);
				this.lines[this.index] = {
					...line,
					indent: column,
					text: rest
				};
				items.push(isSequenceItem(rest) ? this.parseSequence(column, depth + 1) : this.parseMapping(column, depth + 1));
				continue;
			}
			this.index++;
			items.push(this.parseValue(rest, line, indent, depth + 1, false));
		}
		return items;
	}
	parseValue(rest, line, parentIndent, depth, allowCompactSequence) {
		if (rest === "" || rest.startsWith("#")) {
			const next = this.peek();
			if (next !== void 0 && next.indent > parentIndent) return this.parseIndented(parentIndent, depth);
			if (allowCompactSequence && next !== void 0 && next.indent === parentIndent && isSequenceItem(next.text)) return this.parseSequence(parentIndent, depth);
			return null;
		}
		const first = rest[0];
		if (first === "|" || first === ">") return this.parseBlockScalar(rest, line, parentIndent);
		if (first === "\"" || first === "'") {
			const { value, end } = readQuoted(rest, 0, line.no);
			expectOnlyComment(rest.slice(end), line.no);
			return value;
		}
		if (first === "[" || first === "{") {
			const { value, end } = readFlow(rest, 0, line.no, depth);
			expectOnlyComment(rest.slice(end), line.no);
			return value;
		}
		if ("&*!".includes(first)) throw new FrontmatterError("anchors, aliases and tags are not supported", line.no);
		if ("%@`,]}".includes(first)) throw new FrontmatterError(`"${first}" cannot start a plain value; quote it`, line.no);
		if (isSequenceItem(rest) || /^\?(?:[\t ]|$)/.test(rest)) throw new FrontmatterError("a nested collection must start on its own line", line.no);
		return this.parsePlain(rest, line, parentIndent);
	}
	parseIndented(parentIndent, depth) {
		const line = this.peek();
		if (isSequenceItem(line.text)) return this.parseSequence(line.indent, depth);
		if (matchKey(line.text, line.no) !== void 0) return this.parseMapping(line.indent, depth);
		this.index++;
		return this.parseValue(line.text, line, parentIndent, depth, false);
	}
	parsePlain(first, line, parentIndent) {
		let value = stripComment(first);
		assertPlain(value, line.no);
		let commented = COMMENT.test(first);
		let blanks = 0;
		while (this.index < this.lines.length) {
			const next = this.lines[this.index];
			if (next.text === "") {
				blanks++;
				this.index++;
				continue;
			}
			if (next.indent <= parentIndent || next.text.startsWith("#")) break;
			if (isTabIndented(next)) throw new FrontmatterError(TAB_INDENT, next.no);
			if (commented) throw new FrontmatterError("a comment ends a plain value; quote a value that continues past it", next.no);
			const part = stripComment(next.text);
			assertPlain(part, next.no);
			commented = COMMENT.test(next.text);
			value += blanks > 0 ? "\n".repeat(blanks) : " ";
			value += part;
			blanks = 0;
			this.index++;
		}
		return resolvePlain(value, line.no);
	}
	parseBlockScalar(header, line, parentIndent) {
		const match = /^([>|])([+-]?)(?:[\t ]+#.*)?[\t ]*$/.exec(header);
		if (match === null) throw new FrontmatterError(/^[>|][+-]?\d|^[>|]\d/.test(header) ? "block scalar indentation indicators are not supported" : "invalid block scalar header", line.no);
		const contents = [];
		let contentIndent = -1;
		let leadingWidth = 0;
		while (this.index < this.lines.length) {
			const next = this.lines[this.index];
			const spacesOnly = next.indent === next.raw.length;
			if (contentIndent === -1 && !spacesOnly && next.indent > parentIndent) {
				contentIndent = next.indent;
				if (leadingWidth > contentIndent) throw new FrontmatterError("a leading blank line is indented more than the block scalar content", next.no);
			}
			if (contentIndent !== -1 && next.indent >= contentIndent) contents.push(next.raw.slice(contentIndent));
			else if (spacesOnly) {
				if (contentIndent === -1) leadingWidth = Math.max(leadingWidth, next.indent);
				contents.push("");
			} else if (isTabIndented(next)) throw new FrontmatterError(TAB_INDENT, next.no);
			else break;
			this.index++;
		}
		return foldBlock(contents, match[1] === ">", match[2] ?? "");
	}
};
function assertDepth(depth, line) {
	if (depth > MAX_DEPTH) throw new FrontmatterError(`nesting deeper than ${MAX_DEPTH} levels is not supported`, line);
}
function matchKey(text, no) {
	const first = text[0];
	if (first === "\"" || first === "'") {
		const { value, end } = readQuoted(text, 0, no);
		const after = text.slice(end);
		if (after === ":" || /^:[\t ]/.test(after)) return {
			key: checkKey(value, no),
			rest: trimWhiteStart(after.slice(1))
		};
		return;
	}
	if (first === "?") throw new FrontmatterError("complex keys (\"?\") are not supported", no);
	if (first === void 0 || "[]{}&*!|>%@`#,".includes(first)) return void 0;
	for (let index = 0; index < text.length; index++) {
		const char = text[index];
		const previous = text[index - 1];
		if (char === "#" && (previous === " " || previous === "	")) return void 0;
		if (char === ":") {
			const next = text[index + 1];
			if (next === void 0 || next === " " || next === "	") {
				const key = trimWhiteEnd(text.slice(0, index));
				if (key === "") return void 0;
				return {
					key: resolveKey(key, no),
					rest: trimWhiteStart(text.slice(index + 1))
				};
			}
		}
	}
}
function checkKey(key, no) {
	if (key === "__proto__") throw new FrontmatterError("the key \"__proto__\" is not supported", no);
	return key;
}
function resolveKey(raw, no) {
	if (typeof resolvePlain(raw, no) !== "string") throw new FrontmatterError(`key "${raw}" must be a string; quote it`, no);
	return checkKey(raw, no);
}
function assertPlain(text, no) {
	if (/:(?:[\t ]|$)/.test(text)) throw new FrontmatterError("a plain value cannot contain \": \"; quote the value", no);
}
const COMMENT = /[\t ]#/;
function stripComment(text) {
	const match = COMMENT.exec(text);
	return trimWhiteEnd(match === null ? text : text.slice(0, match.index));
}
function expectOnlyComment(after, no) {
	if (trimWhiteStart(after) === "" || /^[\t ]+#/.test(after)) return;
	throw new FrontmatterError("unexpected text after the value", no);
}
function trimWhiteStart(text) {
	return text.slice(skipSpaces(text, 0));
}
function trimWhiteEnd(text) {
	let end = text.length;
	while (end > 0 && (text[end - 1] === " " || text[end - 1] === "	")) end--;
	return text.slice(0, end);
}
const NULL = /^(?:~|null|Null|NULL)$/;
const TRUE = /^(?:true|True|TRUE)$/;
const FALSE = /^(?:false|False|FALSE)$/;
const INTEGER = /^[+-]?\d+$/;
const OCTAL = /^0o[0-7]+$/;
const HEXADECIMAL = /^0x[\dA-Fa-f]+$/;
const FLOAT = /^[+-]?(?:\.\d+|\d+(?:\.\d*)?)(?:[Ee][+-]?\d+)?$/;
const SPECIAL_FLOAT = /^(?:[+-]?\.(?:inf|Inf|INF)|\.(?:nan|NaN|NAN))$/;
function resolvePlain(text, no) {
	if (text === "" || NULL.test(text)) return null;
	if (TRUE.test(text)) return true;
	if (FALSE.test(text)) return false;
	let number;
	if (INTEGER.test(text) || FLOAT.test(text)) number = Number(text);
	else if (OCTAL.test(text)) number = Number.parseInt(text.slice(2), 8);
	else if (HEXADECIMAL.test(text)) number = Number.parseInt(text.slice(2), 16);
	else if (SPECIAL_FLOAT.test(text)) number = NaN;
	if (number === void 0) return text;
	if (!Number.isFinite(number)) throw new FrontmatterError(`"${text}" cannot be represented in JSON; quote it`, no);
	return number;
}
const SIMPLE_ESCAPES = {
	"0": "\0",
	a: "\x07",
	b: "\b",
	t: "	",
	"	": "	",
	n: "\n",
	v: "\v",
	f: "\f",
	r: "\r",
	e: "\x1B",
	" ": " ",
	"\"": "\"",
	"/": "/",
	"\\": "\\",
	N: "",
	_: "\xA0",
	L: "\u2028",
	P: "\u2029"
};
const HEX_ESCAPE_WIDTH = {
	x: 2,
	u: 4,
	U: 8
};
const UNCLOSED_QUOTE = "a quoted value must close on the same line (multi-line quoted values are not supported)";
function readQuoted(text, start, no) {
	const quote = text[start];
	let value = "";
	let index = start + 1;
	while (index < text.length) {
		const char = text[index];
		if (quote === "'") {
			if (char === "'") {
				if (text[index + 1] === "'") {
					value += "'";
					index += 2;
					continue;
				}
				return {
					value,
					end: index + 1
				};
			}
			value += char;
			index++;
			continue;
		}
		if (char === "\"") return {
			value,
			end: index + 1
		};
		if (char === "\\") {
			const escape = decodeEscape(text, index, no);
			value += escape.decoded;
			index += escape.length;
			continue;
		}
		value += char;
		index++;
	}
	throw new FrontmatterError(UNCLOSED_QUOTE, no);
}
function decodeEscape(text, index, no) {
	const code = text[index + 1];
	if (code === void 0) throw new FrontmatterError(UNCLOSED_QUOTE, no);
	const simple = SIMPLE_ESCAPES[code];
	if (simple !== void 0) return {
		decoded: simple,
		length: 2
	};
	const width = HEX_ESCAPE_WIDTH[code];
	if (width === void 0) throw new FrontmatterError(`unknown escape "\\${code}"`, no);
	const hex = text.slice(index + 2, index + 2 + width);
	if (hex.length !== width || !/^[\dA-Fa-f]+$/.test(hex) || Number.parseInt(hex, 16) > 1114111) throw new FrontmatterError(`invalid escape "\\${code}${hex}"`, no);
	return {
		decoded: String.fromCodePoint(Number.parseInt(hex, 16)),
		length: 2 + width
	};
}
function skipSpaces(text, index) {
	let position = index;
	while (text[position] === " " || text[position] === "	") position++;
	return position;
}
const UNCLOSED_FLOW = "a flow collection must close on the same line";
function readFlow(text, start, no, depth) {
	assertDepth(depth, no);
	const open = text[start];
	const close = open === "[" ? "]" : "}";
	const list = [];
	const map = {};
	let index = skipSpaces(text, start + 1);
	if (text[index] === close) return {
		value: open === "[" ? list : map,
		end: index + 1
	};
	for (;;) {
		if (open === "[") {
			const item = readFlowValue(text, index, no, depth);
			list.push(item.value);
			index = skipSpaces(text, item.end);
		} else {
			const key = readFlowKey(text, index, no);
			const item = readFlowValue(text, key.end + 1, no, depth);
			if (Object.hasOwn(map, key.key)) throw new FrontmatterError(`duplicate key "${key.key}"`, no);
			map[key.key] = item.value;
			index = skipSpaces(text, item.end);
		}
		const char = text[index];
		if (char === ",") {
			index = skipSpaces(text, index + 1);
			if (text[index] === close) return {
				value: open === "[" ? list : map,
				end: index + 1
			};
			continue;
		}
		if (char === close) return {
			value: open === "[" ? list : map,
			end: index + 1
		};
		if (char === void 0) throw new FrontmatterError(UNCLOSED_FLOW, no);
		throw new FrontmatterError(`unexpected "${char}" in a flow collection`, no);
	}
}
function readFlowKey(text, start, no) {
	const index = skipSpaces(text, start);
	const char = text[index];
	if (char === void 0) throw new FrontmatterError(UNCLOSED_FLOW, no);
	if (char === "\"" || char === "'") {
		const quoted = readQuoted(text, index, no);
		const colon = skipSpaces(text, quoted.end);
		if (text[colon] !== ":") throw new FrontmatterError("expected \": \" after a key in a flow mapping", no);
		return {
			key: checkKey(quoted.value, no),
			end: colon
		};
	}
	if (char === "[" || char === "{") throw new FrontmatterError("complex keys (flow collections as keys) are not supported", no);
	assertFlowPlainStart(text, index, no);
	const end = scanFlowPlain(text, index);
	const raw = trimWhiteEnd(text.slice(index, end));
	const after = text[end + 1];
	if (raw === "" || text[end] !== ":" || after !== " " && after !== "	") throw new FrontmatterError("expected \"key: value\" in a flow mapping", no);
	return {
		key: resolveKey(raw, no),
		end
	};
}
const FLOW_SEPARATORS = " 	,[]{}";
function assertFlowPlainStart(text, index, no) {
	const char = text[index];
	if ("&*!".includes(char)) throw new FrontmatterError("anchors, aliases and tags are not supported", no);
	if ("|>%@`#".includes(char) || "-?:".includes(char) && FLOW_SEPARATORS.includes(text[index + 1] ?? " ")) throw new FrontmatterError(`"${char}" cannot start a plain value in a flow collection; quote it`, no);
}
function scanFlowPlain(text, index) {
	let end = index;
	while (end < text.length) {
		const char = text[end];
		if (",[]{}".includes(char)) break;
		if (char === "#" && (text[end - 1] === " " || text[end - 1] === "	")) break;
		if (char === ":" && FLOW_SEPARATORS.includes(text[end + 1] ?? " ")) break;
		end++;
	}
	return end;
}
function readFlowValue(text, start, no, depth) {
	const index = skipSpaces(text, start);
	const char = text[index];
	if (char === void 0) throw new FrontmatterError(UNCLOSED_FLOW, no);
	if (char === "[" || char === "{") return readFlow(text, index, no, depth + 1);
	if (char === "\"" || char === "'") return readQuoted(text, index, no);
	assertFlowPlainStart(text, index, no);
	const end = scanFlowPlain(text, index);
	if (text[end] === ":") throw new FrontmatterError("mappings inside flow collections are not supported; quote the value", no);
	const raw = trimWhiteEnd(text.slice(index, end));
	if (raw === "") throw new FrontmatterError("empty value in a flow collection", no);
	return {
		value: resolvePlain(raw, no),
		end
	};
}
function foldBlock(contents, folded, chomping) {
	let result = "";
	let emptyLines = 0;
	let didReadContent = false;
	let atMoreIndented = false;
	for (const content of contents) {
		if (content === "") {
			emptyLines++;
			continue;
		}
		if (folded) if (content.startsWith(" ") || content.startsWith("	")) {
			atMoreIndented = true;
			result += "\n".repeat(didReadContent ? 1 + emptyLines : emptyLines);
		} else if (atMoreIndented) {
			atMoreIndented = false;
			result += "\n".repeat(emptyLines + 1);
		} else if (emptyLines === 0) {
			if (didReadContent) result += " ";
		} else result += "\n".repeat(emptyLines);
		else result += "\n".repeat(didReadContent ? 1 + emptyLines : emptyLines);
		result += content;
		didReadContent = true;
		emptyLines = 0;
	}
	if (chomping === "+") result += "\n".repeat(didReadContent ? 1 + emptyLines : emptyLines);
	else if (chomping === "" && didReadContent) result += "\n";
	return result;
}

//#endregion
//#region ../core-internal/src/ext/skills/uri.ts
const ENCODED_IN_SEGMENT = /[^\w!$&'()*+,.:;=@[\]|~-]/gu;
function encodePathText(text) {
	return text.replaceAll(ENCODED_IN_SEGMENT, (char) => encodeURIComponent(char));
}
/** WHATWG-serialised form of `uri`, or `undefined` if it does not parse. */
function canonicalUri(uri) {
	try {
		return new URL(uri).href;
	} catch {
		return;
	}
}
const MANIFEST_SUFFIX = "/SKILL.md";
/** The skill's root directory URI (no trailing slash), or `undefined` if `skillMdUri` is not a `…/SKILL.md` URI in a named directory. */
function skillRootUri(skillMdUri) {
	const canonical = canonicalUri(skillMdUri);
	if (canonical === void 0 || !canonical.endsWith(MANIFEST_SUFFIX)) return void 0;
	const root = canonical.slice(0, -9);
	return root.endsWith("/") ? void 0 : root;
}
function safeDecode(segment) {
	try {
		return decodeURIComponent(segment);
	} catch {
		return segment;
	}
}
/** The decoded last segment of a directory URI (the authority when the path is empty). */
function lastSegmentOf(rootUri) {
	const url = new URL(rootUri);
	const path = url.pathname;
	return safeDecode(path === "" || path === "/" ? url.host : path.slice(path.lastIndexOf("/") + 1));
}
/** True when `uri` is strictly inside `rootUri` and no segment below it decodes to empty, `.`, `..`, or a name holding `/` or NUL. */
function isWithin(rootUri, uri) {
	const canonical = canonicalUri(uri);
	if (canonical === void 0 || !canonical.startsWith(`${rootUri}/`)) return false;
	return canonical.slice(rootUri.length + 1).split("/").every((segment) => {
		const decoded = safeDecode(segment);
		return decoded !== "" && decoded !== "." && decoded !== ".." && !decoded.includes("/") && !decoded.includes("\0");
	});
}
function decodeOrUndefined(escapes) {
	try {
		return decodeURIComponent(escapes);
	} catch {
		return;
	}
}
function utf8Width(lead) {
	if (lead >= 240) return 4;
	if (lead >= 224) return 3;
	if (lead >= 192) return 2;
	return 1;
}
function keyOfEscapes(run) {
	let key = "";
	for (let at = 0; at < run.length;) {
		const width = 3 * utf8Width(Number.parseInt(run.slice(at + 1, at + 3), 16));
		const decoded = decodeOrUndefined(run.slice(at, at + width));
		if (decoded === void 0) {
			key += `%25${run.slice(at + 1, at + 3)}`;
			at += 3;
		} else {
			key += encodePathText(decoded);
			at += width;
		}
	}
	return key;
}
const ESCAPE_RUN = /((?:%[\dA-Fa-f]{2})+)/;
function keyOfSegment(segment) {
	return segment.split(ESCAPE_RUN).map((part, index) => index % 2 === 0 ? encodePathText(part) : keyOfEscapes(part)).join("");
}
/** The one spelling all ways of writing a file's URI below `rootUri` share (`Q&A.md`, `Q%26A.md#x`); `undefined` if it does not parse. */
function skillFileKey(rootUri, uri) {
	let url;
	try {
		url = new URL(uri);
	} catch {
		return;
	}
	url.hash = "";
	const canonical = url.href;
	if (canonical.includes("?") || !canonical.startsWith(`${rootUri}/`)) return canonical;
	return `${rootUri}/${canonical.slice(rootUri.length + 1).split("/").map((segment) => keyOfSegment(segment)).join("/")}`;
}
/** Resolves `ref` (default `SKILL.md`) against the skill's root, as a browser resolves a link. */
function resolveSkillRef(skillMdUri, ref) {
	const root = skillRootUri(skillMdUri);
	if (root === void 0) throw new TypeError(`${skillMdUri} is not a SKILL.md URI`);
	return new URL(ref ?? "SKILL.md", `${root}/`).href;
}

//#endregion
//#region ../core-internal/src/ext/skills/entry.ts
/** Agent Skills name rule: lowercase letters, digits and single hyphens (length checked separately). */
const SKILL_NAME_PATTERN = /^[\da-z]+(?:-[\da-z]+)*$/;
const isStringMap = (value) => typeof value === "object" && value !== null && !Array.isArray(value) && Object.values(value).every((item) => typeof item === "string");
function countCharacters(text) {
	let count = 0;
	for (let index = 0; index < text.length; index += text.codePointAt(index) > 65535 ? 2 : 1) count++;
	return count;
}
/** Structural rules of the stable spec and Agent Skills. Empty array = valid. */
function validateSkillEntry(skill) {
	const problems = [];
	const root = skillRootUri(skill.uri);
	if (root === void 0) return [`uri "${skill.uri}" must be a URI ending in /SKILL.md inside a named directory`];
	const frontmatter = skill.frontmatter;
	const { name, description } = skill.frontmatter;
	if (name.length === 0 || name.length > 64 || !SKILL_NAME_PATTERN.test(name)) problems.push(`frontmatter name "${name}" must be 1-64 lowercase letters, digits and single hyphens`);
	else if (lastSegmentOf(root) !== name) problems.push(`frontmatter name "${name}" must match the last path segment "${lastSegmentOf(root)}"`);
	if (description === "" || countCharacters(description) > 1024) problems.push("frontmatter description must be 1-1024 characters");
	const compatibility = frontmatter["compatibility"];
	if (compatibility !== void 0 && (typeof compatibility !== "string" || compatibility === "" || countCharacters(compatibility) > 500)) problems.push("frontmatter compatibility must be a string of 1-500 characters");
	if (frontmatter["metadata"] !== void 0 && !isStringMap(frontmatter["metadata"])) problems.push("frontmatter metadata must map strings to strings");
	if (skill.resources !== "dynamic") {
		const self = canonicalUri(skill.uri);
		const seen = /* @__PURE__ */ new Set();
		let hasSelf = false;
		for (const resource of skill.resources) {
			const canonical = canonicalUri(resource.uri);
			if (canonical === void 0) {
				problems.push(`resource "${resource.uri}" is not a valid URI`);
				continue;
			}
			if (/[#?]/.test(canonical)) {
				problems.push(`resource "${resource.uri}" must not have a query or fragment`);
				continue;
			}
			const key = skillFileKey(root, canonical) ?? canonical;
			if (seen.has(key)) problems.push(`resource "${resource.uri}" is listed more than once`);
			seen.add(key);
			if (canonical === self) hasSelf = true;
			else if (!isWithin(root, resource.uri)) problems.push(`resource "${resource.uri}" is outside the skill directory ${root}`);
		}
		if (!hasSelf) problems.push(`resources must include ${skill.uri}`);
	}
	return problems;
}

//#endregion
//#region src/ext/skills/entries.ts
/** Schema and rule checks for one entry received from a server. */
function checkEntry(value) {
	const raw = value?.uri;
	const uri = typeof raw === "string" ? raw : void 0;
	const parsed = SkillSchema.safeParse(value);
	if (!parsed.success) return {
		uri,
		problems: parsed.error.issues.map((issue) => `${issue.path.join(".") || "(entry)"}: ${issue.message}`)
	};
	return {
		skill: parsed.data,
		uri,
		problems: validateSkillEntry(parsed.data)
	};
}
function keyOf(entry) {
	return entry.uri === void 0 ? void 0 : canonicalUri(entry.uri) ?? entry.uri;
}
/** Splits listing entries into valid skills and refused entries. Every copy of a repeated URI is refused. */
function partitionEntries(values) {
	const checked = values.map((value) => checkEntry(value));
	const counts = /* @__PURE__ */ new Map();
	for (const entry of checked) {
		const key = keyOf(entry);
		if (key !== void 0) counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	const skills = [];
	const invalid = [];
	for (const [index, entry] of checked.entries()) {
		const key = keyOf(entry);
		const problems = key !== void 0 && (counts.get(key) ?? 0) > 1 ? [...entry.problems, "the same uri is listed more than once"] : entry.problems;
		if (entry.skill !== void 0 && problems.length === 0) skills.push(entry.skill);
		else invalid.push({
			index,
			...entry.uri !== void 0 && { uri: entry.uri },
			reason: problems.join("; ")
		});
	}
	return {
		skills,
		invalid
	};
}

//#endregion
//#region src/ext/skills/pageSchemas.ts
const cacheFields = {
	ttlMs: z.number().int().nonnegative(),
	cacheScope: z.enum(["public", "private"])
};
/**
* `skills/list` and `skills/get` envelopes that leave entries unchecked, so a
* bad entry is reported on its own instead of failing the whole response.
* Defined with this package's own `zod`, so no schema crosses package copies.
*/
const SkillsPageSchema = z.looseObject({
	skills: z.array(z.unknown()),
	nextCursor: z.string().optional(),
	...cacheFields
});
const GetSkillEnvelopeSchema = z.looseObject({
	skill: z.unknown(),
	...cacheFields
});
/** The 2026-07-28 result envelopes: each result extends `CacheableResult`, so both caching fields are required. */
const MODERN_ENVELOPES = {
	list: SkillsPageSchema,
	get: GetSkillEnvelopeSchema,
	directory: ReadResourceDirectoryResultSchema
};
const uncached = {
	ttlMs: true,
	cacheScope: true
};
/** The 2025-11-25 result envelopes: the backport has no caching fields, so they are optional. */
const LEGACY_ENVELOPES = {
	list: SkillsPageSchema.partial(uncached),
	get: GetSkillEnvelopeSchema.partial(uncached),
	directory: ReadResourceDirectoryResultSchema.partial(uncached)
};

//#endregion
//#region src/ext/skills/verify.ts
const isPlainObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const show = (value) => value === void 0 ? "nothing" : JSON.stringify(value);
const fieldOf = (path, key) => path === "" ? key : `${path}.${key}`;
/** Every field a reader of `object` sees, inherited ones included; Object.prototype's (`constructor`, `__proto__`) are not enumerable. */
function fieldsOf(object) {
	const fields = /* @__PURE__ */ new Map();
	for (const key in object) fields.set(key, object[key]);
	return fields;
}
/**
* Field-level differences between a skill entry's frontmatter and the
* frontmatter parsed from its `SKILL.md`: every key both ways, objects in any
* key order, arrays in order, numbers by value, no type coercion.
*/
function frontmatterDifferences(entry, parsed, path = "") {
	const label = path === "" ? "(frontmatter)" : path;
	if (Array.isArray(entry) && Array.isArray(parsed)) {
		if (entry.length !== parsed.length) return [`${label}: the entry has ${entry.length} items, SKILL.md has ${parsed.length}`];
		return entry.flatMap((item, index) => frontmatterDifferences(item, parsed[index], `${path}[${index}]`));
	}
	if (isPlainObject(entry) && isPlainObject(parsed)) {
		const [fromEntry, fromParsed] = [fieldsOf(entry), fieldsOf(parsed)];
		return [...new Set([...fromEntry.keys(), ...fromParsed.keys()])].toSorted().flatMap((key) => frontmatterDifferences(fromEntry.get(key), fromParsed.get(key), fieldOf(path, key)));
	}
	return entry === parsed ? [] : [`${label}: the entry has ${show(entry)}, SKILL.md has ${show(parsed)}`];
}

//#endregion
//#region src/ext/skills/skillsClient.ts
function decodeBlob(uri, blob) {
	try {
		return decodeBase64(blob);
	} catch (error) {
		throw new SdkError(SdkErrorCode.InvalidResult, `resources/read returned an invalid base64 blob for ${uri}`, void 0, { cause: error });
	}
}
/**
* Resolves `ref` against the skill root and drops its fragment. A listed file is found in the entry by
* {@linkcode skillFileKey}, since servers percent-encode names differently (`Q&A.md`, `Q%26A.md`); a
* `"dynamic"` skill's file is requested at the resolved URI, as nothing published another spelling.
* Throws `unlisted` for a ref that does not parse or names no file of the skill.
*/
function resolveTarget(skill, ref) {
	const root = skillRootUri(skill.uri);
	if (root === void 0) throw new TypeError(`${skill.uri} is not a SKILL.md URI`);
	let uri;
	try {
		const resolved = new URL(resolveSkillRef(skill.uri, ref));
		resolved.hash = "";
		uri = resolved.href;
	} catch (error) {
		const given = ref ?? "";
		throw new SkillVerificationError("unlisted", given, `${given} is not a URI reference`, [], { cause: error });
	}
	const key = skillFileKey(root, uri) ?? uri;
	const manifest = key === skillFileKey(root, skill.uri);
	const notInSkill = () => new SkillVerificationError("unlisted", uri, `${uri} is not a file of the skill ${skill.uri}`);
	if (skill.resources === "dynamic") {
		if (!manifest && !isWithin(root, key)) throw notInSkill();
		return {
			uri,
			root,
			key,
			listed: void 0,
			manifest
		};
	}
	const listed = skill.resources.find((resource) => skillFileKey(root, resource.uri) === key);
	if (listed === void 0) throw notInSkill();
	return {
		uri: listed.uri,
		root,
		key,
		listed,
		manifest
	};
}
/** A result's `ttlMs` and `cacheScope`, where it has them (always, on 2026-07-28). */
function cacheFieldsOf(result) {
	return {
		...result.ttlMs !== void 0 && { ttlMs: result.ttlMs },
		...result.cacheScope !== void 0 && { cacheScope: result.cacheScope }
	};
}
function unsupported(method) {
	return new SdkError(SdkErrorCode.CapabilityNotSupported, `Server does not support the ${SKILLS_EXTENSION_ID$1} extension (required for ${method})`);
}
/**
* Host side of the MCP Skills extension (SEP-2640): lists, gets and reads a
* server's skills, and verifies every file against the server's entry.
* Approval, origin tagging and loading policy stay with the host.
*
* @example
* ```ts
* const skills = new SkillsClient(client);
* const { skills: entries } = await skills.list();
* const manifest = await skills.read(entries[0]!);
* ```
*/
var SkillsClient = class {
	#client;
	#options;
	constructor(client, options = {}) {
		this.#client = client;
		this.#options = options;
	}
	/** The server declared the extension (and `resources`, under `enforceStrictCapabilities`). `false` before connect. */
	get supported() {
		const capabilities = this.#client.getServerCapabilities();
		if (skillsCapabilityOf(capabilities) === void 0) return false;
		return !clientInternals.enforceStrictCapabilities(this.#client) || capabilities?.resources !== void 0;
	}
	/** The server serves `resources/directory/read`. */
	get directoryRead() {
		return this.supported && skillsCapabilityOf(this.#client.getServerCapabilities())?.directoryRead === true;
	}
	/**
	* Lists the server's skills, walking every page unless given a cursor
	* (bounded by the client's `listMaxPages`). Throws an `SdkError` naming
	* every invalid entry, and every copy of a repeated URI; with
	* `skipInvalid`, returns them in `invalid` instead. A 2026-07-28 page
	* without `ttlMs` and `cacheScope` throws either way. On a server without
	* the extension: an empty listing.
	*/
	async list(params = {}, options) {
		if (!this.supported) {
			if (clientInternals.enforceStrictCapabilities(this.#client)) throw unsupported(SKILLS_LIST_METHOD$1);
			console.debug(`SkillsClient.list() called but the server does not declare ${SKILLS_EXTENSION_ID$1} - returning an empty list`);
			return {
				skills: [],
				invalid: []
			};
		}
		const page = await this.#pages(SKILLS_LIST_METHOD$1, this.#envelopes().list, {}, params.cursor, options, (result) => result.skills);
		const { skills, invalid } = partitionEntries(page.skills);
		if (invalid.length > 0 && !this.#options.skipInvalid) {
			const detail = invalid.map((entry) => `#${entry.index} ${entry.uri ?? ""}: ${entry.reason}`).join("\n");
			throw new SdkError(SdkErrorCode.InvalidResult, `skills/list returned invalid entries:\n${detail}`, { invalid });
		}
		return {
			skills,
			invalid,
			...params.cursor !== void 0 && page.nextCursor !== void 0 && { nextCursor: page.nextCursor },
			...cacheFieldsOf(page)
		};
	}
	/**
	* One skill by its `SKILL.md` URI, listed or not, with the result's caching
	* fields on 2026-07-28. Throws if the server returns an invalid entry or
	* another skill.
	*/
	async get(uri, options) {
		if (!this.supported) throw unsupported(SKILLS_GET_METHOD$1);
		const result = await this.#client.request({
			method: SKILLS_GET_METHOD$1,
			params: { uri }
		}, this.#envelopes().get, options);
		const { skill, problems } = checkEntry(result.skill);
		if (skill === void 0 || problems.length > 0) throw new SdkError(SdkErrorCode.InvalidResult, `skills/get returned an invalid entry for ${uri}: ${problems.join("; ")}`);
		if (canonicalUri(skill.uri) !== canonicalUri(uri)) throw new SdkError(SdkErrorCode.InvalidResult, `skills/get for ${uri} returned ${skill.uri}`);
		return {
			skill,
			...cacheFieldsOf(result)
		};
	}
	/**
	* Reads one file of `skill` and verifies it. `ref` is a path relative to
	* the skill's root (`references/FORMS.md`) or an absolute URI; the
	* default is the skill's own `SKILL.md`; a fragment is ignored. The file
	* must be listed in the entry (checked before any request, however either
	* side percent-encodes the name) and is requested by the entry's URI; its
	* size and digest must match;
	* for the skill's own `SKILL.md` the frontmatter must also equal the
	* entry's. A copy from the client's response cache that fails a check is
	* fetched once more with `cacheMode: 'refresh'`. `"dynamic"` skills skip
	* the listing, size and digest checks (`verified: false`) but not the
	* frontmatter. Pass entries from {@linkcode SkillsClient.list} or
	* {@linkcode SkillsClient.get}; an invalid entry throws a `TypeError`
	* before any request.
	*
	* @throws {SkillVerificationError} when a check fails.
	*/
	async read(skill, ref, options) {
		if (!this.supported) throw unsupported("resources/read");
		const { problems } = checkEntry(skill);
		if (problems.length > 0) throw new TypeError(`${skill.uri} is not a valid skill entry: ${problems.join("; ")}`);
		const target = resolveTarget(skill, ref);
		const params = { uri: target.uri };
		const { result, cached } = await clientInternals.readResource(this.#client, params, options);
		try {
			return await this.#verify(skill, target, result);
		} catch (error) {
			if (!(error instanceof SkillVerificationError) || !cached) throw error;
			return this.#verify(skill, target, await this.#client.readResource(params, {
				...options,
				cacheMode: "refresh"
			}));
		}
	}
	async #verify(skill, target, result) {
		const { uri, root, key, listed } = target;
		const content = result.contents.find((item) => (skillFileKey(root, item.uri) ?? item.uri) === key);
		if (content === void 0) throw new SdkError(SdkErrorCode.InvalidResult, `resources/read returned no contents for ${uri}`);
		const bytes = "text" in content ? encodeUtf8(content.text) : decodeBlob(uri, content.blob);
		if (listed !== void 0) {
			if (bytes.byteLength !== listed.size) throw new SkillVerificationError("size", uri, `${uri} is ${bytes.byteLength} bytes; the skill entry lists ${listed.size}`);
			const digest = await sha256Digest(bytes);
			if (digest !== listed.digest) throw new SkillVerificationError("digest", uri, `${uri} has digest ${digest}; the skill entry lists ${listed.digest}`);
		}
		const file = {
			uri,
			...content.mimeType !== void 0 && { mimeType: content.mimeType },
			bytes,
			..."text" in content && { text: content.text },
			verified: listed !== void 0
		};
		if (!target.manifest) return file;
		const markdown = "text" in content ? content.text : decodeUtf8Lossless(bytes);
		if (markdown === void 0) throw new SkillVerificationError("frontmatter", uri, `${uri} is not valid UTF-8`);
		const { frontmatter, body } = this.#parse(uri, markdown);
		const differences = frontmatterDifferences(skill.frontmatter, frontmatter);
		if (differences.length > 0) throw new SkillVerificationError("frontmatter", uri, `the frontmatter of ${uri} differs from the skill entry: ${differences.join("; ")}`, differences);
		return {
			...file,
			text: markdown,
			frontmatter,
			body
		};
	}
	#parse(uri, markdown) {
		try {
			const parse = this.#options.parseFrontmatter;
			if (parse === void 0) return parseSkillMarkdown(markdown);
			const { yaml, body } = splitFrontmatter(markdown);
			return {
				frontmatter: parse(yaml),
				body
			};
		} catch (error) {
			throw new SkillVerificationError("frontmatter", uri, `the frontmatter of ${uri} cannot be read: ${error instanceof Error ? error.message : String(error)}`, [], { cause: error });
		}
	}
	/**
	* The direct children of a skill directory, every page walked, with the
	* first page's caching fields on 2026-07-28. Needs `directoryRead`.
	*/
	async readDirectory(uri, options) {
		if (!this.directoryRead) throw new SdkError(SdkErrorCode.CapabilityNotSupported, `Server does not declare directoryRead for ${SKILLS_EXTENSION_ID$1} (required for ${RESOURCES_DIRECTORY_READ_METHOD$1})`);
		const page = await this.#pages(RESOURCES_DIRECTORY_READ_METHOD$1, this.#envelopes().directory, { uri }, void 0, options, (result) => result.resources);
		return {
			resources: page.resources,
			...cacheFieldsOf(page)
		};
	}
	/** The result envelopes for the negotiated version. */
	#envelopes() {
		return isModernProtocolVersion(this.#client.getNegotiatedProtocolVersion() ?? "") ? MODERN_ENVELOPES : LEGACY_ENVELOPES;
	}
	/** One page (with `cursor`), or every page in one, walked as Client walks its own list verbs. */
	#pages(method, schema, params, cursor, options, items) {
		const fetchPage = (at) => this.#client.request({
			method,
			params: at === void 0 ? params : {
				...params,
				cursor: at
			}
		}, schema, options);
		return cursor === void 0 ? clientInternals.walkPages(this.#client, method, fetchPage, items) : fetchPage(cursor);
	}
};

//#endregion
export { DIRECTORY_MIME_TYPE, RESOURCES_DIRECTORY_READ_METHOD, SKILLS_EXTENSION_ID, SKILLS_GET_METHOD, SKILLS_LIST_METHOD, SKILL_LIMITS, SkillVerificationError, SkillsClient };
//# sourceMappingURL=index.mjs.map