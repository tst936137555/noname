/**
 * 对比版本号
 * @param { string } ver1 版本号1
 * @param { string } ver2 版本号2
 * @returns { -1 | 0 | 1 } -1为ver1 < ver2, 0为ver1 == ver2, 1为ver1 > ver2
 * @throws {Error}
 */
export function checkVersion(ver1, ver2) {
	if (typeof ver1 !== "string") {
		ver1 = String(ver1);
	}
	if (typeof ver2 !== "string") {
		ver2 = String(ver2);
	}

	// 移除 'v' 开头
	if (ver1.startsWith("v")) {
		ver1 = ver1.slice(1);
	}
	if (ver2.startsWith("v")) {
		ver2 = ver2.slice(1);
	}

	// 验证版本号格式
	if (/[^0-9.-]/i.test(ver1) || /[^0-9.-]/i.test(ver2)) {
		throw new Error("Invalid characters found in the version numbers");
	}

	/** @param { string } str */
	function* walk(str) {
		let part = "";
		for (const char of str) {
			if (char === "." || char === "-") {
				if (part) {
					yield Number(part);
				}
				part = "";
			} else {
				part += char;
			}
		}
		if (part) {
			yield Number(part);
		}
	}

	const iterator1 = walk(ver1);
	const iterator2 = walk(ver2);

	while (true) {
		const iter1 = iterator1.next();
		const iter2 = iterator2.next();
		let { value: item1 } = iter1;
		let { value: item2 } = iter2;

		// 如果任意一个迭代器已经没有剩余值，将该值视为0
		item1 = item1 === undefined ? 0 : item1;
		item2 = item2 === undefined ? 0 : item2;

		if (isNaN(item1) || isNaN(item2)) {
			throw new Error("Non-numeric part found in the version numbers");
		} else if (item1 > item2) {
			return 1;
		} else if (item1 < item2) {
			return -1;
		} else {
			if (iter1.done && iter2.done) {
				break;
			}
		}
	}

	// 若正常遍历结束，说明版本号相等
	return 0;
}
