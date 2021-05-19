// https://www.reddit.com/r/CryptoCurrency/comments/n9cby0/not_every_new_coin_is_a_shitcoin_how_to_spot_the/

// https://bscscan.com/tokentxns

const { firefox } = require("playwright");
const { sprintf } = require("sprintf-js");

class DungBeetle {
	constructor(page) {
		this.page = page;
		this.shitSeen = {};
	}

	async run() {
		await this.page.goto('https://bscscan.com/tokentxns');

		const imgs = await this.page.$$('[src="/images/main/empty-token.png"]');

		const shitCoins = {};

		for (const img of imgs) {
			const a = await img.$('xpath=..');
			const link = await a.evaluate(node => node.getAttribute('href'));
			const id = link.split('/').slice(-1)[0];
			const text = await a.evaluate(el => el.innerText);
			shitCoins[id] = text.trim();
		}

		for (const id in shitCoins) {
			if (id in this.shitSeen) continue;
			this.shitSeen[id] = true;

			console.log("checking", shitCoins[id], 'https://bscscan.com/token/' + id, "https://poocoin.app/tokens/" + id);

			const steps = [
				this.checkVolume.bind(this),
				this.checkPoocoin.bind(this),
				this.checkHolders.bind(this)
			]

			let reasonShit;

			for (const step of steps) {
				reasonShit = await step(id);

				if (reasonShit) {
					console.log("💩💩💩", reasonShit);
					break;
				}
			}

			if (! reasonShit) console.log("🚀🚀🚀🚀🚀");

			console.log("");
		}
	}

	async checkVolume(id) {
		await this.page.goto('https://bscscan.com/token/' + id);
		await this.page.waitForSelector('#tokentxnsiframe');

		const elementHandle = await this.page.$('#tokentxnsiframe')
		const frame = await elementHandle.contentFrame()

		const rows = await frame.$$('#maindiv table tbody tr');
		const number = rows.length;

		const firstTime = await rows[0].evaluate(el =>
			el.querySelector('[data-original-title]').innerText
		);

		const lastTime = await rows.slice(-1)[0].evaluate(el =>
			el.querySelector('[data-original-title]').innerText
		);

		const secsPassed = (Date.parse(firstTime) - Date.parse(lastTime)) / 1000;

		const txPerMinute = (number / secsPassed) * 60;

		console.log("TX per minute", txPerMinute.toFixed(2));

		if (txPerMinute < 5) return "Low TX per minute";
	}

	async checkHolders(id) {
		await this.page.goto('https://bscscan.com/token/' + id + '#balances');
		await this.page.waitForSelector('#tokeholdersiframe')

		const elementHandle = await this.page.$('#tokeholdersiframe')
		const frame = await elementHandle.contentFrame()

		const rows = await frame.$$('#maintable table tbody tr');

		let whaleNumber = 0;
		let lpPercentage = 0;
		let deadPercentage = 0;
		let whalePercentage = 0;

		for (const row of rows) {
			const addressA = await row.$('td:nth-child(2) a');
			const link = await addressA.evaluate(node => node.getAttribute('href'));
			const address = link.split('=').slice(-1)[0]
			const text = await addressA.evaluate(el => el.innerText);

			let percentage = await row.evaluate(el => el.querySelector('[aria-valuenow]').getAttribute('aria-valuenow'));
			percentage = parseFloat(percentage);

			if (/^PancakeSwap/.test(text)) {
				lpPercentage += percentage;
			} else if (/^0x0000000000/.test(address)) {
				deadPercentage += percentage;

				// https://poocoin.app/rugcheck/0xebdf1b978dc2576ef0020ba4cf5f98174425c3a1
				// maybe we should multiple whales by 1/(1-DEAD)?
			} else {
				whaleNumber++;
				whalePercentage += percentage;

				if (whaleNumber === 10) break;
			}
		}

		console.log(sprintf('LP %.2f DEAD %.2f TOP10W %.2f', lpPercentage, deadPercentage, whalePercentage));

		if (lpPercentage + deadPercentage < 50) {
			return "Not enought LP + DEAD %";
		} else if (whalePercentage > 30) {
			return "Too high whale %";
		}
	}

	async checkPoocoin(id) {
		await this.page.goto("https://poocoin.app/tokens/" + id);
		await this.page.waitForSelector('.px-3 .text-success');

		const elements = await this.page.$$('.px-3 .text-success');

		let attempt = 0;

		while (true) {
			attempt++;

			const html = await this.page.content();
			if (html.includes("BNB LP does not exist for this token")) return "No LP";

			const mCap = await elements[0].evaluate(el => el.innerText);
			if (mCap !== "$") break;

			if (attempt >= 1000) return "Timeout fetching LP size";
			await sleep(100);
		}

		const lp = await elements[1].evaluate(el => parseInt(el.innerText.replace(/\D/g, '')));

		console.log("LP size: $" + (lp / 1000).toFixed(0) + "k");

		if (lp < 30000) return "Low LP";
	}

	async p(el) {
		const val = await el.evaluate(el => el.outerHTML);
		console.log(val);
	}
}

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

(async () => {
	const browser = await firefox.launch({headless: false}); // poocoin uses cloudflare -> doesn't work headless
	const context = await browser.newContext();
	const page = await context.newPage();
	const db = new DungBeetle(page);

	while (true) {
		await db.run();
	}

	console.log("Bye");

	await browser.close();
})();

