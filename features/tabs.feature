@ui @tabs
Feature: Browser tabs

  Background:
    Given I open the page "/demo/tabs"

  Scenario: A link that opens a second tab
    When I click the link "go" and switch to the new tab
    Then the page title is "Second page"
    And 2 tabs should be open

  Scenario: Closing the other tabs leaves only the first
    When I click the link "go" and switch to the new tab
    And I switch back to the first tab
    And I close all other tabs
    Then 1 tab should be open
    And the page title is "Home"
