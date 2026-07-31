@jira-KAN-7 @generated
Feature: Add product to cart
  As a shopper
  I want to add a product to my cart
  So that I can purchase it later

  Scenario: Add a product to the cart
    Given I am viewing a product page
    When I click "Add to Cart"
    Then the product appears in my cart
    And the cart count increases by 1
