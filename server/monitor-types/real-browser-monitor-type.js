const { MonitorType } = require("./monitor-type");
const { chromium, Browser } = require("playwright-core");
const { UP, log } = require("../../src/util");
const { Settings } = require("../settings");
const commandExistsSync = require("command-exists").sync;
const childProcess = require("child_process");
const path = require("path");
const Database = require("../database");
const jwt = require("jsonwebtoken");

/**
 *
 * @type {Browser}
 */
let browser = null;

async function getBrowser() {
    if (!browser) {
        let executablePath = await Settings.get("chromeExecutable");

        executablePath = await prepareChromeExecutable(executablePath);

        browser = await chromium.launch({
            //headless: false,
            executablePath,
        });
    }
    return browser;
}

async function prepareChromeExecutable(executablePath) {
    // Special code for using the playwright_chromium
    if (typeof executablePath === "string" && executablePath.toLocaleLowerCase() === "#playwright_chromium") {
        executablePath = undefined;
    } else if (!executablePath) {
        if (process.env.UPTIME_KUMA_IS_CONTAINER) {
            executablePath = "/usr/bin/chromium";

            // Install chromium in container via apt install
            if ( !commandExistsSync(executablePath)) {
                await new Promise((resolve, reject) => {
                    log.info("Chromium", "Installing Chromium...");
                    let child = childProcess.exec("apt update && apt --yes --no-install-recommends install chromium fonts-indic fonts-noto fonts-noto-cjk");

                    // On exit
                    child.on("exit", (code) => {
                        log.info("Chromium", "apt install chromium exited with code " + code);

                        if (code === 0) {
                            log.info("Chromium", "Installed Chromium");
                            let version = childProcess.execSync(executablePath + " --version").toString("utf8");
                            log.info("Chromium", "Chromium version: " + version);
                            resolve();
                        } else if (code === 100) {
                            reject(new Error("Installing Chromium, please wait..."));
                        } else {
                            reject(new Error("apt install chromium failed with code " + code));
                        }
                    });
                });
            }

        } else if (process.platform === "win32") {
            executablePath = findChrome([
                "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
                "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
                "D:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
                "D:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
                "E:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
                "E:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
            ]);
        } else if (process.platform === "linux") {
            executablePath = findChrome([
                "chromium-browser",
                "chromium",
                "google-chrome",
            ]);
        }
        // TODO: Mac??
    }
    return executablePath;
}

function findChrome(executables) {
    for (let executable of executables) {
        if (commandExistsSync(executable)) {
            return executable;
        }
    }
    throw new Error("Chromium not found, please specify Chromium executable path in the settings page.");
}

async function resetChrome() {
    if (browser) {
        await browser.close();
        browser = null;
    }
}

/**
 * Test if the chrome executable is valid and return the version
 * @param executablePath
 * @returns {Promise<string>}
 */
async function testChrome(executablePath) {
    try {
        executablePath = await prepareChromeExecutable(executablePath);

        log.info("Chromium", "Testing Chromium executable: " + executablePath);

        const browser = await chromium.launch({
            executablePath,
        });
        const version = browser.version();
        await browser.close();
        return version;
    } catch (e) {
        throw new Error(e.message);
    }
}

/**
 * TODO: connect remote browser? https://playwright.dev/docs/api/class-browsertype#browser-type-connect
 *
 */
class RealBrowserMonitorType extends MonitorType {

    name = "real-browser";

    async check(monitor, heartbeat, server) {
        const browser = await getBrowser();
        const context = await browser.newContext();
        const page = await context.newPage();

        const res = await page.goto(monitor.url, {
            waitUntil: "networkidle",
            timeout: monitor.interval * 1000 * 0.8,
        });

        let filename = jwt.sign(monitor.id, server.jwtSecret) + ".png";

        await page.screenshot({
            path: path.join(Database.screenshotDir, filename),
        });

        await context.close();

        if (res.status() >= 200 && res.status() < 400) {
            heartbeat.status = UP;
            heartbeat.msg = res.status();

            const timing = res.request().timing();
            heartbeat.ping = timing.responseEnd;
        } else {
            throw new Error(res.status() + "");
        }
    }
}

module.exports = {
    RealBrowserMonitorType,
    testChrome,
    resetChrome,
};
