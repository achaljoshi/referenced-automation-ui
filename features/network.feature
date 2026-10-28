@ui @network
Feature: A page whose dependency fails
  Against a real server, a failing or unreachable dependency shows up on the page

  Background:
    Given the sample app is running
    And I open the page "{{sampleApp}}"

  Scenario: A dependency that answers with an error
    Given the request to "**/api/items*" fails with status 503
    When I click the button "Load"
    Then the status "Status" has the text "error 503"

  Scenario: Going offline fails the request and coming back online works again
    Given I am offline
    When I click the button "Load"
    Then the status "Status" has the text "failed"
    Given I am back online
    When I click the button "Load"
    Then the status "Status" has the text "loaded real"
