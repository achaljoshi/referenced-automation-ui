@ui @dialogs
Feature: Browser dialogs
  A dialog is answered on purpose, and what it asked is part of the check

  Background:
    Given I open the page "/demo/dialogs"

  Scenario: Accepting a confirmation goes ahead with the action
    Given I accept all dialogs
    When I click the button "Confirm"
    Then I saw the confirm dialog "Delete this order?" and it was accepted
    And the status "Result" has the text "deleted"

  Scenario: Dismissing a confirmation is a real answer: the action is not taken
    Given I dismiss all dialogs
    When I click the button "Confirm"
    Then I saw the confirm dialog "Delete this order?" and it was dismissed
    And the status "Result" has the text "kept"

  Scenario: An alert is accepted and the page carries on
    Given I accept all dialogs
    When I click the button "Alert"
    Then I saw the alert dialog "Saved!" and it was accepted
    And the status "Result" has the text "after alert"
