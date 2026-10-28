@ui @browser-state
Feature: Browser state
  The browser's window size and clock can be set for a scenario

  Scenario: The tablet breakpoint sets the size of the browser window
    Given I open the page "/"
    And I use the tablet viewport
    Then the browser window is 768 by 1024

  Scenario: A fixed clock makes the date the page shows predictable
    Given the clock is fixed at "2024-02-02T10:00:00Z"
    When I open the page "/demo/clock"
    Then the status "Now" has the text "2024-02-02T10:00:00.000Z"
