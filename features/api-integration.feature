@ui @smoke
Feature: A page that calls a backend
  The page shows what its backend answers, whether the backend is a mock server or the browser answers the call itself

  Scenario: A mock server stands in for a backend that does not exist yet
    Given a mock backend answers GET "/api/profile" with JSON:
      """
      { "name": "Ada Lovelace" }
      """
    When I open the profile page that reads "/api/profile" from the mock backend
    Then the status "Profile name" has the text "Ada Lovelace"

  Scenario: The browser answers the call itself, with no backend at all
    # a domain that can never resolve for real: the answer can only have come from the browser
    Given the browser answers GET "**/api/profile" with JSON:
      """
      { "name": "Mocked Ada" }
      """
    When I open the profile page that reads "http://never-called.invalid/api/profile"
    Then the status "Profile name" has the text "Mocked Ada"
