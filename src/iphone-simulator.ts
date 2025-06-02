import { execFileSync, spawn, ChildProcess } from "child_process";
import { randomBytes } from "crypto";
import path from "path";
import { tmpdir } from "os";

import { WebDriverAgent } from "./webdriver-agent";
import { ActionableError, Button, InstalledApp, Robot, ScreenElement, ScreenSize, SwipeDirection, Orientation } from "./robot";

export interface Simulator {
	name: string;
	uuid: string;
	state: string;
}

interface ListDevicesResponse {
	devices: {
		[key: string]: Array<{
			state: string;
			name: string;
			isAvailable: boolean;
			udid: string;
		}>,
	},
}

interface AppInfo {
	ApplicationType: string;
	Bundle: string;
	CFBundleDisplayName: string;
	CFBundleExecutable: string;
	CFBundleIdentifier: string;
	CFBundleName: string;
	CFBundleVersion: string;
	DataContainer: string;
	Path: string;
}

const TIMEOUT = 30000;
const WDA_PORT = 8100;
const MAX_BUFFER_SIZE = 1024 * 1024 * 4;

const activeRecordings = new Map<string, {
	process: ChildProcess,
	simulatorUuid: string,
	videoPath: string
}>();

export class Simctl implements Robot {

	constructor(private readonly simulatorUuid: string) {}

	private async wda(): Promise<WebDriverAgent> {
		const wda = new WebDriverAgent("localhost", WDA_PORT);

		if (!(await wda.isRunning())) {
			throw new ActionableError("WebDriverAgent is not running on simulator, please see https://github.com/mobile-next/mobile-mcp/wiki/");
		}

		return wda;
	}

	private simctl(...args: string[]): Buffer {
		return execFileSync("xcrun", ["simctl", ...args], {
			timeout: TIMEOUT,
			maxBuffer: MAX_BUFFER_SIZE,
		});
	}

	private simctlSpawn(...args: string[]): ChildProcess {
		return spawn("xcrun", ["simctl", ...args], {
			detached: true,
			stdio: ["ignore", "pipe", "pipe"]
		});
	}

	public async getScreenshot(): Promise<Buffer> {
		return this.simctl("io", this.simulatorUuid, "screenshot", "-");
	}

	public async openUrl(url: string) {
		const wda = await this.wda();
		await wda.openUrl(url);
		// alternative: this.simctl("openurl", this.simulatorUuid, url);
	}

	public async launchApp(packageName: string, locale?: string) {
		if (locale) {
			const language = locale.split("_")[0];

			if (locale.includes("_")) {
				this.simctl(
					"launch",
					this.simulatorUuid,
					packageName,
					"--args",
					"-AppleLanguages", `(${language})`,
					"-AppleLocale", locale
				);
			} else {
				this.simctl(
					"launch",
					this.simulatorUuid,
					packageName,
					"--args",
					"-AppleLanguages", `(${language})`
				);
			}
		} else {
			this.simctl("launch", this.simulatorUuid, packageName);
		}
	}

	public async terminateApp(packageName: string) {
		this.simctl("terminate", this.simulatorUuid, packageName);
	}

	public static parseIOSAppData(inputText: string): Array<AppInfo> {
		const result: Array<AppInfo> = [];

		enum ParseState {
			LOOKING_FOR_APP,
			IN_APP,
			IN_PROPERTY
		}

		let state = ParseState.LOOKING_FOR_APP;
		let currentApp: Partial<AppInfo> = {};
		let appIdentifier = "";

		const lines = inputText.split("\n");
		for (let line of lines) {
			line = line.trim();
			if (line === "") {
				continue;
			}

			switch (state) {
				case ParseState.LOOKING_FOR_APP:
					// look for app identifier pattern: "com.example.app" = {
					const appMatch = line.match(/^"?([^"=]+)"?\s*=\s*\{/);
					if (appMatch) {
						appIdentifier = appMatch[1].trim();
						currentApp = {
							CFBundleIdentifier: appIdentifier,
						};

						state = ParseState.IN_APP;
					}
					break;

				case ParseState.IN_APP:
					if (line === "};") {
						result.push(currentApp as AppInfo);
						currentApp = {};
						state = ParseState.LOOKING_FOR_APP;
					} else {
						// look for property: PropertyName = Value;
						const propertyMatch = line.match(/^([^=]+)\s*=\s*(.+?);\s*$/);
						if (propertyMatch) {
							const propName = propertyMatch[1].trim();
							let propValue = propertyMatch[2].trim();

							// remove quotes if present (they're optional)
							if (propValue.startsWith('"') && propValue.endsWith('"')) {
								propValue = propValue.substring(1, propValue.length - 1);
							}

							// add property to current app
							(currentApp as any)[propName] = propValue;
						} else if (line.endsWith("{")) {
							// nested property like GroupContainers = {
							state = ParseState.IN_PROPERTY;
						}
					}
					break;

				case ParseState.IN_PROPERTY:
					if (line === "};") {
						// end of nested property
						state = ParseState.IN_APP;
					}

					// skip content of nested properties, we don't care of those right now
					break;
			}
		}

		return result;
	}

	public async listApps(): Promise<InstalledApp[]> {
		const text = this.simctl("listapps", this.simulatorUuid).toString();
		const apps = Simctl.parseIOSAppData(text);
		return apps.map(app => ({
			packageName: app.CFBundleIdentifier,
			appName: app.CFBundleDisplayName,
		}));
	}

	public async getScreenSize(): Promise<ScreenSize> {
		const wda = await this.wda();
		return wda.getScreenSize();
	}

	public async sendKeys(keys: string) {
		const wda = await this.wda();
		return wda.sendKeys(keys);
	}

	public async swipe(direction: SwipeDirection) {
		const wda = await this.wda();
		return wda.swipe(direction);
	}

	public async tap(x: number, y: number) {
		const wda = await this.wda();
		return wda.tap(x, y);
	}

	public async pressButton(button: Button) {
		const wda = await this.wda();
		return wda.pressButton(button);
	}

	public async getElementsOnScreen(): Promise<ScreenElement[]> {
		const wda = await this.wda();
		return wda.getElementsOnScreen();
	}

	public async setOrientation(orientation: Orientation): Promise<void> {
		const wda = await this.wda();
		return wda.setOrientation(orientation);
	}

	public async getOrientation(): Promise<Orientation> {
		const wda = await this.wda();
		return wda.getOrientation();
	}

	public async startRecording(): Promise<string> {
		const recordingId = randomBytes(8).toString("hex");
		const videoPath = path.join(tmpdir(), `recording_${recordingId}.mov`);

		const recordingProcess = this.simctlSpawn("io", this.simulatorUuid, "recordVideo", videoPath);

		activeRecordings.set(recordingId, {
			process: recordingProcess,
			simulatorUuid: this.simulatorUuid,
			videoPath: videoPath
		});

		return recordingId;
	}

	public async stopRecording(recordingId: string): Promise<string> {
		const recording = activeRecordings.get(recordingId);

		if (!recording) {
			throw new ActionableError(`No active recording found with ID: ${recordingId}`);
		}

		if (recording.simulatorUuid !== this.simulatorUuid) {
			throw new ActionableError(`Recording ${recordingId} is not associated with this simulator`);
		}

		recording.process.kill("SIGINT");
		await new Promise(resolve => setTimeout(resolve, 2000));
		activeRecordings.delete(recordingId);

		return recording.videoPath;
	}
}

export class SimctlManager {

	public listSimulators(): Simulator[] {
		// detect if this is a mac
		if (process.platform !== "darwin") {
			// don't even try to run xcrun
			return [];
		}

		try {
			const text = execFileSync("xcrun", ["simctl", "list", "devices", "-j"]).toString();
			const json: ListDevicesResponse = JSON.parse(text);
			return Object.values(json.devices).flatMap(device => {
				return device.map(d => {
					return {
						name: d.name,
						uuid: d.udid,
						state: d.state,
					};
				});
			});
		} catch (error) {
			console.error("Error listing simulators", error);
			return [];
		}
	}

	public listBootedSimulators(): Simulator[] {
		return this.listSimulators()
			.filter(simulator => simulator.state === "Booted");
	}

	public getSimulator(uuid: string): Simctl {
		return new Simctl(uuid);
	}
}
