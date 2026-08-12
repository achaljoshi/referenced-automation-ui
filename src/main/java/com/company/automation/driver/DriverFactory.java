package com.company.automation.driver;

import com.company.automation.config.ConfigReader;
import io.github.bonigarcia.wdm.WebDriverManager;
import org.openqa.selenium.MutableCapabilities;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.chrome.ChromeOptions;
import org.openqa.selenium.edge.EdgeDriver;
import org.openqa.selenium.edge.EdgeOptions;
import org.openqa.selenium.firefox.FirefoxDriver;
import org.openqa.selenium.firefox.FirefoxOptions;
import org.openqa.selenium.remote.RemoteWebDriver;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.net.MalformedURLException;
import java.net.URI;
import java.time.Duration;

/**
 * Builds a fully configured {@link WebDriver} instance: local (with the
 * matching driver binary resolved automatically by WebDriverManager - no
 * manual chromedriver/geckodriver download or PATH setup) or remote against
 * a Selenium Grid / cloud provider when {@code grid.url} is configured.
 *
 * <p>Consuming projects normally never call this directly - {@code
 * com.company.automation.hooks.Hooks} does it for every scenario via
 * {@link DriverManager}. It is public so teams that want a custom driver
 * lifecycle can still reuse the browser-building logic.
 */
public final class DriverFactory {

    private static final Logger LOG = LoggerFactory.getLogger(DriverFactory.class);

    private DriverFactory() {
    }

    public static WebDriver createDriver() {
        BrowserType browserType = BrowserType.fromString(ConfigReader.browser());
        boolean headless = ConfigReader.headless();
        WebDriver driver = ConfigReader.isRemoteExecution()
                ? createRemoteDriver(browserType, headless)
                : createLocalDriver(browserType, headless);

        driver.manage().timeouts().implicitlyWait(Duration.ofSeconds(ConfigReader.implicitWaitSeconds()));
        driver.manage().timeouts().pageLoadTimeout(Duration.ofSeconds(ConfigReader.pageLoadTimeoutSeconds()));
        driver.manage().window().maximize();
        return driver;
    }

    private static WebDriver createLocalDriver(BrowserType browserType, boolean headless) {
        LOG.info("Launching LOCAL {} (headless={})", browserType, headless);
        switch (browserType) {
            case FIREFOX -> {
                WebDriverManager.firefoxdriver().setup();
                return new FirefoxDriver(firefoxOptions(headless));
            }
            case EDGE -> {
                WebDriverManager.edgedriver().setup();
                return new EdgeDriver(edgeOptions(headless));
            }
            case CHROME -> {
                WebDriverManager.chromedriver().setup();
                return new ChromeDriver(chromeOptions(headless));
            }
            default -> throw new IllegalStateException("Unhandled browser type: " + browserType);
        }
    }

    private static WebDriver createRemoteDriver(BrowserType browserType, boolean headless) {
        String gridUrl = ConfigReader.remoteGridUrl();
        LOG.info("Launching REMOTE {} on grid '{}' (headless={})", browserType, gridUrl, headless);
        MutableCapabilities capabilities = switch (browserType) {
            case FIREFOX -> firefoxOptions(headless);
            case EDGE -> edgeOptions(headless);
            case CHROME -> chromeOptions(headless);
        };
        try {
            return new RemoteWebDriver(URI.create(gridUrl).toURL(), capabilities);
        } catch (MalformedURLException e) {
            throw new IllegalArgumentException("Invalid grid.url: '" + gridUrl + "'", e);
        }
    }

    private static ChromeOptions chromeOptions(boolean headless) {
        ChromeOptions options = new ChromeOptions();
        if (headless) {
            options.addArguments("--headless=new");
        }
        options.addArguments(
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--remote-allow-origins=*",
                "--window-size=1920,1080");
        return options;
    }

    private static FirefoxOptions firefoxOptions(boolean headless) {
        FirefoxOptions options = new FirefoxOptions();
        if (headless) {
            options.addArguments("-headless");
        }
        return options;
    }

    private static EdgeOptions edgeOptions(boolean headless) {
        EdgeOptions options = new EdgeOptions();
        if (headless) {
            options.addArguments("--headless=new");
        }
        options.addArguments("--no-sandbox", "--disable-dev-shm-usage");
        return options;
    }
}
