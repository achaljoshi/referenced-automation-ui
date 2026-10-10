@ui @regression
Feature: The dashboard
  Once signed in, I can use the page's controls

  Background:
    Given I open the page "/"
    And I fill in "Username" with "ada"
    And I fill in "Password" with "{{env:UI_PASSWORD}}"
    And I click the button "Log in"

  Scenario: Pick a country from a list
    When I select "United Kingdom" from "Country"
    Then the field "Country" has the value "uk"

  Scenario: Tick and untick a box
    When I check "Subscribe"
    Then the checkbox "Subscribe" is checked
    When I uncheck "Subscribe"
    Then the checkbox "Subscribe" is not checked

  Scenario: Items that appear a moment later are waited for, without a wait step
    When I click the button "Load items"
    Then I should see 3 elements with the role "listitem"
    And I should see "Item 2"

  Scenario: Drag and drop
    When I drag "Drag me" onto "Drop here"
    Then I should see "dropped"

  Scenario: A link that opens a new tab
    When I click the link "Open new tab" and switch to the new tab
    Then the URL contains "about:blank"
    When I switch back to the first tab
    Then I should see the heading "Dashboard"

  Scenario: Download a report
    When I download the file by clicking the link "Download report"
    Then the downloaded file is named "report.txt"
    And the downloaded file contains "hello from the report"

  Scenario: Upload a file
    When I upload the file "tests/support/upload-fixture.txt" to "Upload a file"
    Then I should see "upload-fixture.txt"

  Scenario: The page works on a phone-sized screen
    Given I use the mobile viewport
    Then I should see the heading "Dashboard"
    And the page has no accessibility violations

  Scenario: Nothing is broken behind the scenes
    Given I watch the page for console errors and failed requests
    When I click the button "Load items"
    Then I should see "Item 1"
    And the page has had no console errors or failed requests
