package com.company.automation.pages;

import com.company.automation.base.BasePage;
import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;

import java.util.List;
import java.util.stream.Collectors;

/**
 * Page object for the SauceDemo inventory/products page shown after a
 * successful login.
 */
public class ProductsPage extends BasePage {

    private final By pageTitle = By.className("title");
    private final By inventoryItems = By.className("inventory_item_name");
    private final By addToCartButtons = By.cssSelector("button.btn_inventory");
    private final By cartBadge = By.className("shopping_cart_badge");

    public ProductsPage(WebDriver driver) {
        super(driver);
    }

    public boolean isLoaded() {
        return isDisplayed(pageTitle) && "Products".equals(textOf(pageTitle));
    }

    public List<String> productNames() {
        return driver.findElements(inventoryItems).stream()
                .map(element -> element.getText())
                .collect(Collectors.toList());
    }

    public void addFirstProductToCart() {
        driver.findElements(addToCartButtons).get(0).click();
    }

    public int cartItemCount() {
        if (!isDisplayed(cartBadge)) {
            return 0;
        }
        return Integer.parseInt(textOf(cartBadge));
    }
}
