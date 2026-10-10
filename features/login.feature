@ui @smoke
Feature: Logging in
  As a registered user
  I want to log in
  So that I can see my dashboard

  Background:
    Given I open the page "/"

  Scenario: A valid login shows the dashboard
    When I fill in "Username" with "ada"
    And I fill in "Password" with "{{env:UI_PASSWORD}}"
    And I click the button "Log in"
    Then I should see the heading "Dashboard"
    And I should not see the heading "Login"

  Scenario: A wrong password is refused with a message
    When I fill in "Username" with "ada"
    And I fill in "Password" with "not-the-password"
    And I click the button "Log in"
    Then I should see "Invalid credentials"
    And I should not see the heading "Dashboard"

  Scenario Outline: Only the right credentials get in
    When I fill in "Username" with "<user>"
    And I fill in "Password" with "<password>"
    And I click the button "Log in"
    Then I should see "<result>"

    Examples:
      | user  | password | result              |
      | ada   | secret   | Dashboard           |
      | ada   | wrong    | Invalid credentials |
      | grace | secret   | Invalid credentials |

  Scenario: The login form is accessible
    Then the page has no accessibility violations

  Scenario: The fields start empty
    Then the field "Username" has the value ""
    And the field "Password" has the value ""
