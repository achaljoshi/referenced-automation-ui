@ui @smoke
Feature: Test data that is unique, fresh or comes from the environment

  Scenario: A value made up on the fly is typed into a field and read back
    Given I open the page "/"
    And I generate a random email called "login"
    When I fill in "Username" with "{{login}}"
    Then the field "Username" has the value "{{login}}"
    And the variable "login" matches ".+@.+"

  Scenario: What is on the page can be remembered for later steps
    Given I open the page "/"
    When I fill in "Username" with "ada-{{random:alnum(4)}}"
    And I remember the text of the heading "Login" as "heading"
    Then the variable "heading" equals "Login"
