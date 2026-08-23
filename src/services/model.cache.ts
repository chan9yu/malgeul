import { MODEL_CACHE_KEY, MODEL_ID } from './model.config';

const MODEL_WEIGHT_EXTENSION = '.onnx';

export async function isModelCached() {
	if (typeof caches === 'undefined') {
		return false;
	}

	try {
		const cache = await caches.open(MODEL_CACHE_KEY);
		const requests = await cache.keys();

		return requests.some(isModelWeight);
	} catch {
		return false;
	}
}

function isModelWeight(request: Request) {
	return request.url.includes(MODEL_ID) && request.url.endsWith(MODEL_WEIGHT_EXTENSION);
}
