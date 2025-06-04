export interface Dimensions {
	width: number;
	height: number;
}

export interface ScreenSize extends Dimensions {
	scale: number;
}

export interface InstalledApp {
	packageName: string;
	appName: string;
}

export type SwipeDirection = "up" | "down" | "left" | "right";

export type Button = "HOME" | "BACK" | "VOLUME_UP" | "VOLUME_DOWN" | "ENTER" | "DPAD_CENTER" | "DPAD_UP" | "DPAD_DOWN" | "DPAD_LEFT" | "DPAD_RIGHT";

export interface ScreenElementRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface ScreenElement {
	type: string;
	label?: string;
	text?: string;
	name?: string;
	value?: string;
	identifier?: string;
	rect: ScreenElementRect;

	// currently only on android tv
	focused?: boolean;
}

export class ActionableError extends Error {
	constructor(message: string) {
		super(message);
	}
}

export type Orientation = "portrait" | "landscape";

export interface Robot {
	/**
	 * Get the screen size of the device in pixels.
	 */
	getScreenSize(): Promise<ScreenSize>;

	/**
	 * Swipe in a direction.
	 */
	swipe(direction: SwipeDirection): Promise<void>;

	/**
	 * Swipe from specific coordinates in any direction.
	 * @param fromX Starting X coordinate
	 * @param fromY Starting Y coordinate
	 * @param direction Direction to swipe in
	 * @param distance Distance to swipe in pixels (default: 300)
	 */
	swipeFromCoordinates(fromX: number, fromY: number, direction: SwipeDirection, distance?: number): Promise<void>;

	/**
	 * Get a screenshot of the screen. Returns a Buffer that contains
	 * a PNG image of the screen. Will be same dimensions as getScreenSize().
	 */
	getScreenshot(): Promise<Buffer>;

	/**
	 * List all installed apps on the device. Returns an array of package names (or
	 * bundle identifiers in iOS) for all installed apps.
	 */
	listApps(): Promise<InstalledApp[]>;

	/**
	 * Launch an app.
	 */
	launchApp(packageName: string, locale?: string): Promise<void>;

	/**
	 * Terminate an app. If app was already terminated (or non existent) then this
	 * is a no-op.
	 */
	terminateApp(packageName: string): Promise<void>;

	/**
	 * Open a URL in the device's web browser. Can be an https:// url, or a
	 * custom scheme (e.g. "myapp://").
	 */
	openUrl(url: string): Promise<void>;

	/**
	 * Send keys to the device, simulating keyboard input.
	 */
	sendKeys(text: string): Promise<void>;

	/**
	 * Press a button on the device, simulating a physical button press.
	 */
	pressButton(button: Button): Promise<void>;

	/**
	 * Tap on a specific coordinate on the screen.
	 */
	tap(x: number, y: number): Promise<void>;

	/**
	 * Get all elements on the screen. Works only on native apps (not webviews). Will
	 * return a filtered list of elements that make sense to interact with.
	 */
	getElementsOnScreen(): Promise<ScreenElement[]>;

	/**
	 * Change the screen orientation of the device.
	 * @param orientation The desired orientation ("portrait" or "landscape")
	 */
	setOrientation(orientation: Orientation): Promise<void>;

	/**
	 * Get the current screen orientation.
	 */
	getOrientation(): Promise<Orientation>;

	/**
	 * Start screen recording and return a recording ID.
	 * The video will be saved to a temporary location.
	 */
	startRecording(): Promise<string>;

	/**
	 * Stop screen recording and return the path to the video file.
	 * @param recordingId The recording ID returned from startRecording
	 * @returns The path to the saved video file
	 */
	stopRecording(recordingId: string): Promise<string>;
}
