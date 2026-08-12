package com.company.automation.stepdefinitions;

import com.company.automation.driver.DriverManager;
import com.company.automation.pages.LoginPage;
import com.company.automation.pages.ProductsPage;
import io.cucumber.java.en.And;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;
import org.junit.jupiter.api.Assertions;

/**
 * Step definitions for login.feature. Notice these only talk to page
 * objects - never directly to Selenium - and get their WebDriver from
 * {@link DriverManager}, which {@code com.company.automation.hooks.Hooks}
 * (on the framework's glue path) has already created for this scenario.
 */
public class LoginSteps {

    private LoginPage loginPage;
    private ProductsPage productsPage;

    @Given("I am on the SauceDemo login page")
    public void i_am_on_the_login_page() {
        loginPage = new LoginPage(DriverManager.getDriver()).open();
    }

    @When("I log in with username {string} and password {string}")
    public void i_log_in_with(String username, String password) {
        productsPage = loginPage.loginAs(username, password);
    }

    @Then("I should be redirected to the products page")
    public void i_should_be_redirected_to_products_page() {
        Assertions.assertTrue(productsPage.isLoaded(), "Expected the Products page to be loaded after login");
    }

    @Then("I should see the error message {string}")
    public void i_should_see_the_error_message(String expectedError) {
        Assertions.assertTrue(loginPage.isErrorDisplayed(), "Expected a login error message to be displayed");
        Assertions.assertEquals(expectedError, loginPage.errorText());
    }

    @And("I add the first product to the cart")
    public void i_add_the_first_product_to_the_cart() {
        productsPage.addFirstProductToCart();
    }

    @Then("the cart badge should show {string} item")
    public void the_cart_badge_should_show(String expectedCount) {
        Assertions.assertEquals(Integer.parseInt(expectedCount), productsPage.cartItemCount());
    }
}
