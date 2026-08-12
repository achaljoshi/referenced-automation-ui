@login
Feature: SauceDemo Login
  As a registered user of the SauceDemo store
  I want to log in with my credentials
  So that I can browse products

  Background:
    Given I am on the SauceDemo login page

  @smoke
  Scenario: Successful login with a valid standard user
    When I log in with username "standard_user" and password "secret_sauce"
    Then I should be redirected to the products page

  @regression
  Scenario Outline: Login is rejected for invalid credentials
    When I log in with username "<username>" and password "<password>"
    Then I should see the error message "<error>"

    Examples:
      | username        | password       | error                                                                     |
      | standard_user   | wrong_password | Epic sadface: Username and password do not match any user in this service |
      | locked_out_user | secret_sauce   | Epic sadface: Sorry, this user has been locked out.                       |

  @regression
  Scenario: Adding a product to the cart updates the cart badge
    When I log in with username "standard_user" and password "secret_sauce"
    And I add the first product to the cart
    Then the cart badge should show "1" item
