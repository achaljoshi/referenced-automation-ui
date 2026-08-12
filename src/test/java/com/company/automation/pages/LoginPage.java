package com.company.automation.pages;

import com.company.automation.base.BasePage;
import com.company.automation.config.ConfigReader;
import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;

/**
 * Page object for the SauceDemo login page (https://www.saucedemo.com/).
 * Demonstrates the Page Object Model pattern this framework expects
 * consuming teams to follow: extend {@link BasePage}, keep locators private,
 * expose intent-revealing public methods.
 */
public class LoginPage extends BasePage {

    private final By usernameField = By.id("user-name");
    private final By passwordField = By.id("password");
    private final By loginButton = By.id("login-button");
    private final By errorMessage = By.cssSelector("[data-test='error']");

    public LoginPage(WebDriver driver) {
        super(driver);
    }

    public LoginPage open() {
        navigateTo(ConfigReader.baseUrl());
        return this;
    }

    public ProductsPage loginAs(String username, String password) {
        type(usernameField, username);
        type(passwordField, password);
        click(loginButton);
        return new ProductsPage(driver);
    }

    public boolean isErrorDisplayed() {
        return isDisplayed(errorMessage);
    }

    public String errorText() {
        return textOf(errorMessage);
    }
}
