@jira-DEMO-101 @generated @e2e
Feature: User can log in with valid credentials
  Auto-generated from DEMO-101
  https://example.atlassian.net/browse/DEMO-101

  Background:
    Given the application is reachable

  Scenario: Successful login with valid credentials
    Given I am on the login page
    When I enter email "user@example.com" and password "ValidPass123!"
    And I click the Sign In button
    Then I should be redirected to the dashboard
    And I should see a welcome message

  Scenario: Login fails with invalid credentials
    Given I am on the login page
    When I enter email "user@example.com" and password "wrong-password"
    And I click the Sign In button
    Then I should see a login error message
    And I should remain on the login page
