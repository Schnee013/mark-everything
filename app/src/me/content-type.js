// Bookmarker 0.1.30 (MIT), src/metadata.ts. See licenses/bookmarker.txt.
export function detectType(url, ogType) {
	const lower = url.toLowerCase();
	if (/\.(pdf|docx?|pptx?|xlsx?|epub|odt|rtf)(\?|#|$)/.test(lower)) return "document";
	if (/\.(jpe?g|png|gif|webp|svg|bmp|avif)(\?|#|$)/.test(lower)) return "image";
	if (/\.(mp4|webm|mov|mkv|avi)(\?|#|$)/.test(lower)) return "video";
	if (/\.(mp3|wav|ogg|flac|m4a|aac)(\?|#|$)/.test(lower)) return "audio";

	const host = safeHostname(url).replace(/^www\./, "");
	if (/^(youtube\.com|youtu\.be|vimeo\.com|twitch\.tv|dailymotion\.com)$/.test(host)) {
		return "video";
	}
	if (/^(open\.)?spotify\.com$|^soundcloud\.com$/.test(host)) return "audio";

	const og = ogType.toLowerCase();
	if (og.startsWith("video")) return "video";
	if (og.startsWith("music")) return "audio";
	if (og === "article") return "article";
	return "link";
}

function safeHostname(url) {
	try {
		return new URL(url).hostname;
	} catch {
		return "";
	}
}
