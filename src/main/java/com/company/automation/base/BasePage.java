package com.company.automation.base;

import com.company.automation.utils.WaitUtils;
import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Base class for every Page Object in this framework and in any consuming
 * project. Extend it, call {@code super(driver)}, and use the protected
 * helpers below instead of talking to raw Selenium APIs - that is what
 * keeps waits, logging and null-safety consistent across the whole suite.
 *
 * <p>Locators are declared as plain {@link By} fields and looked up fresh
 * on every interaction (via {@link WaitUtils}) rather than injected once
 * with {@code @FindBy}/{@code PageFactory} - this avoids the classic
 * {@code StaleElementReferenceException} that eager field-proxy injection is
 * prone to on dynamic pages.
 *
 * <pre>{@code
 * public class LoginPage extends BasePage {
 *     private final By usernameField = By.id("user-name");
 *
 *     public LoginPage(WebDriver driver) {
 *         super(driver);
 *     }
 *
 *     public void login(String username, String password) {
 *         type(usernameField, username);
 *         ...
 *     }
 * }
 * }</pre>
 */
public abstract class BasePage {

    protected final Logger log = LoggerFactory.getLogger(getClass());
    protected final WebDriver driver;

    protected BasePage(WebDriver driver) {
        this.driver = driver;
    }

    protected void click(By locator) {
        log.debug("Click -> {}", locator);
        WaitUtils.waitForClickable(driver, locator).click();
    }

    protected void type(By locator, String text) {
        log.debug("Type '{}' -> {}", text, locator);
        WebElement element = WaitUtils.waitForVisible(driver, locator);
        element.clear();
        element.sendKeys(text);
    }

    protected String textOf(By locator) {
        String text = WaitUtils.waitForVisible(driver, locator).getText();
        log.debug("Read text '{}' <- {}", text, locator);
        return text;
    }

    protected boolean isDisplayed(By locator) {
        try {
            return WaitUtils.waitForVisible(driver, locator, 3).isDisplayed();
        } catch (Exception e) {
            return false;
        }
    }

    protected void navigateTo(String url) {
        log.info("Navigating to {}", url);
        driver.get(url);
    }

    public String currentUrl() {
        return driver.getCurrentUrl();
    }

    public String title() {
        return driver.getTitle();
    }
}
